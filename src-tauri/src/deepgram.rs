//! Deepgram realtime transcription transport.
//!
//! Single reusable client for all native STT paths (macOS / Windows × system / mic).
//! Owns the WebSocket connection, reader task, KeepAlive, PCM forwarding, and
//! status event emission. Platform STT commands only need to capture PCM into a
//! `broadcast::Receiver<Arc<Vec<u8>>>` and call [`run_session`].
//!
//! # Why this module exists
//!
//! Previously each of the four STT commands manually built a
//! `tungstenite::http::Request` with `Authorization` header and passed it to
//! `connect_async`. That request was missing the WebSocket handshake headers
//! (`Sec-WebSocket-Key`, `Sec-WebSocket-Version`, `Connection: Upgrade`,
//! `Upgrade: websocket`, `Host`), which tungstenite rejected with
//! `WebSocket protocol error: Missing, duplicated or incorrect header
//! sec-websocket-key`. The fix is to build the request via
//! [`IntoClientRequest`] which produces a fully-formed handshake request and
//! then add the `Authorization` header on top.
//!
//! Live in a dedicated module so the four STT commands cannot regress to the
//! old broken pattern.

#![cfg(any(target_os = "macos", target_os = "windows"))]

use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc,
};
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use tauri::{AppHandle, Emitter};
use tokio::sync::broadcast;
use tokio_tungstenite::{
    connect_async,
    tungstenite::{
        client::IntoClientRequest, http::header::AUTHORIZATION, protocol::CloseFrame,
        Message as WsMsg,
    },
};

/// Transcript payload emitted to the frontend on `stt:system-audio` / `stt:mic`.
#[derive(serde::Serialize, Clone)]
pub struct TranscriptPayload {
    pub text: String,
    pub is_final: bool,
}

/// Status payload emitted on `stt:status:system` / `stt:status:mic`.
///
/// `status` is one of: `"connecting"`, `"transcribing"`, `"idle"`, `"error"`.
/// `error` carries a human-readable reason when `status == "error"`.
#[derive(serde::Serialize, Clone)]
pub struct SttStatusPayload {
    pub status: String,
    pub error: Option<String>,
}

/// System-channel health payload emitted on `stt:health:system`.
#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SystemHealthPayload {
    pub channel: String,
    pub capture_running: bool,
    pub deepgram_running: bool,
    pub pcm_frames_sent: u64,
    pub last_pcm_at: u64,
    pub empty_final_streak: u64,
    pub generation: u64,
    pub state: String,
}

#[derive(Copy, Clone)]
pub struct SystemHealthAtoms {
    pub capture_running: &'static AtomicBool,
    pub deepgram_running: &'static AtomicBool,
    pub pcm_frames_sent: &'static AtomicU64,
    pub last_pcm_at: &'static AtomicU64,
    pub empty_final_streak: &'static AtomicU64,
}

fn emit_system_health(
    app: &AppHandle,
    atoms: Option<&SystemHealthAtoms>,
    generation: u64,
    state: &str,
) {
    let Some(h) = atoms else { return };
    let payload = SystemHealthPayload {
        channel: "system".to_string(),
        capture_running: h.capture_running.load(Ordering::SeqCst),
        deepgram_running: h.deepgram_running.load(Ordering::SeqCst),
        pcm_frames_sent: h.pcm_frames_sent.load(Ordering::SeqCst),
        last_pcm_at: h.last_pcm_at.load(Ordering::SeqCst),
        empty_final_streak: h.empty_final_streak.load(Ordering::SeqCst),
        generation,
        state: state.to_string(),
    };
    let _ = app.emit("stt:health:system", payload);
}

/// Which capture path this Deepgram session belongs to. Determines event
/// channel names and log tags so callers cannot mismatch them.
#[derive(Copy, Clone)]
pub enum SttChannel {
    /// System audio (macOS SCKit / Windows WASAPI loopback).
    System,
    /// Microphone input (CPAL on both platforms).
    Mic,
}

impl SttChannel {
    fn transcript_event(self) -> &'static str {
        match self {
            SttChannel::System => "stt:system-audio",
            SttChannel::Mic => "stt:mic",
        }
    }
    fn status_event(self) -> &'static str {
        match self {
            SttChannel::System => "stt:status:system",
            SttChannel::Mic => "stt:status:mic",
        }
    }
    fn log_tag(self) -> &'static str {
        match self {
            SttChannel::System => "stt:system",
            SttChannel::Mic => "stt:mic",
        }
    }
}

/// Connection parameters for a Deepgram realtime session.
pub struct DeepgramConfig {
    pub api_key: String,
    pub model: String,
    pub language: String,
    pub sample_rate: u32,
    pub channels: u32,
    /// Optional Deepgram endpointing latency in milliseconds.
    /// Leave unset for mic so the existing mic behavior stays unchanged.
    pub endpointing_ms: Option<u32>,
    /// Optional utterance-end latency. Deepgram requires values >= 1000 ms.
    pub utterance_end_ms: Option<u32>,
    /// A short identifier appended as `&tag=` in the Deepgram URL — useful for
    /// distinguishing requests in Deepgram's usage dashboard.
    pub tag: &'static str,
}

/// Why the session ended. Determines the final status event.
enum ExitReason {
    /// User invoked the stop command — emit `"idle"`.
    UserStop,
    /// Deepgram closed the socket cleanly (typically auth failure or quota).
    RemoteClose(Option<CloseFrame<'static>>),
    /// Read side errored.
    ReadError(String),
    /// Write side errored (KeepAlive or PCM frame).
    SendError(String),
    /// PCM broadcast channel closed (capture thread died).
    BroadcastClosed,
}

impl ExitReason {
    fn into_status(self) -> SttStatusPayload {
        match self {
            ExitReason::UserStop => SttStatusPayload {
                status: "idle".into(),
                error: None,
            },
            ExitReason::RemoteClose(frame) => {
                let detail = frame
                    .map(|f| format!("Deepgram closed connection: {} ({})", f.reason, f.code))
                    .unwrap_or_else(|| "Deepgram closed connection without reason".to_string());
                SttStatusPayload {
                    status: "error".into(),
                    error: Some(detail),
                }
            }
            ExitReason::ReadError(e) => SttStatusPayload {
                status: "error".into(),
                error: Some(format!("Deepgram read error: {e}")),
            },
            ExitReason::SendError(e) => SttStatusPayload {
                status: "error".into(),
                error: Some(format!("Deepgram send error: {e}")),
            },
            ExitReason::BroadcastClosed => SttStatusPayload {
                status: "error".into(),
                error: Some("Audio capture stopped unexpectedly".into()),
            },
        }
    }
}

/// Run a complete Deepgram session: connect, forward PCM, parse transcripts,
/// keep alive, and clean up. Returns when the user stops (`running=false`),
/// the generation counter is bumped, the remote closes, or an error occurs.
///
/// On entry, emits `"connecting"` then `"transcribing"`. On exit, always emits
/// either `"idle"` (clean stop) or `"error"` with a reason. `running` is
/// always reset to `false` before returning.
pub async fn run_session(
    app: AppHandle,
    cfg: DeepgramConfig,
    channel: SttChannel,
    mut pcm_rx: broadcast::Receiver<Arc<Vec<u8>>>,
    running: &'static AtomicBool,
    generation: &'static AtomicU64,
    my_gen: u64,
    system_health: Option<SystemHealthAtoms>,
) {
    let tag = channel.log_tag();
    let status_evt = channel.status_event();
    let transcript_evt = channel.transcript_event();
    if let Some(h) = system_health {
        h.deepgram_running.store(false, Ordering::SeqCst);
    }

    // ── Validate inputs before touching the network ─────────────────────────
    // An empty model or language causes Deepgram to return 400 Bad Request
    // with `model is required` / `language is required`. Catch it locally so
    // the user sees a meaningful error instead of a generic HTTP 400.
    let model = cfg.model.trim();
    let language = cfg.language.trim();
    if model.is_empty() {
        eprintln!("[{tag}] config rejected: model is empty");
        running.store(false, Ordering::SeqCst);
        let _ = app.emit(status_evt, SttStatusPayload {
            status: "error".into(),
            error: Some("Deepgram model is required".into()),
        });
        return;
    }
    if language.is_empty() {
        eprintln!("[{tag}] config rejected: language is empty");
        running.store(false, Ordering::SeqCst);
        let _ = app.emit(status_evt, SttStatusPayload {
            status: "error".into(),
            error: Some("Deepgram language is required".into()),
        });
        return;
    }
    if cfg.sample_rate == 0 || cfg.channels == 0 {
        eprintln!(
            "[{tag}] config rejected: sample_rate={} channels={}",
            cfg.sample_rate, cfg.channels
        );
        running.store(false, Ordering::SeqCst);
        let _ = app.emit(status_evt, SttStatusPayload {
            status: "error".into(),
            error: Some("Deepgram sample_rate/channels must be > 0".into()),
        });
        return;
    }
    if cfg.api_key.trim().is_empty() {
        eprintln!("[{tag}] config rejected: api_key is empty");
        running.store(false, Ordering::SeqCst);
        let _ = app.emit(status_evt, SttStatusPayload {
            status: "error".into(),
            error: Some("Deepgram API key is missing (check VITE_DEEPGRAM_API_KEY in .env)".into()),
        });
        return;
    }

    // ── Build the WebSocket URL ─────────────────────────────────────────────
    // BASELINE MINIMAL PARAM SET — proven against Deepgram realtime API.
    // Each param has been individually verified against Deepgram's docs:
    //   model            required
    //   language         required
    //   encoding=linear16, sample_rate, channels  required for raw PCM
    //   punctuate=true   safe with all models
    //   interim_results=true   needed for live UI updates
    //   smart_format=true       safe with all models
    //   tag              optional, identifies the request in Deepgram dashboard
    //
    // PARAMS WE DELIBERATELY DO NOT SEND (any of these can cause HTTP 400):
    //   utterance_end_ms — Deepgram requires >= 1000; we previously sent 600
    //                      which is what was causing the 400 Bad Request.
    //   endpointing      — model-specific support; safer to omit and let
    //                      Deepgram pick a default.
    //   vad_events       — only valid with certain models/versions; omit to
    //                      avoid silent param-validation rejections.
    //
    // Values are URL-encoded with `url::form_urlencoded` so model/language/tag
    // strings with spaces or special chars cannot corrupt the query string.
    let endpointing = cfg.endpointing_ms.map(|v| v.max(10).to_string());
    let utterance_end = cfg.utterance_end_ms.map(|v| v.max(1000).to_string());
    let query = {
        let mut query_builder = url::form_urlencoded::Serializer::new(String::new());
        query_builder
            .append_pair("model", model)
            .append_pair("language", language)
            .append_pair("encoding", "linear16")
            .append_pair("sample_rate", &cfg.sample_rate.to_string())
            .append_pair("channels", &cfg.channels.to_string())
            .append_pair("punctuate", "true")
            .append_pair("interim_results", "true")
            .append_pair("smart_format", "true");
        if let Some(v) = endpointing.as_deref() {
            query_builder.append_pair("endpointing", v);
        }
        if let Some(v) = utterance_end.as_deref() {
            query_builder.append_pair("utterance_end_ms", v);
        }
        query_builder.append_pair("tag", cfg.tag).finish()
    };
    let dg_url = format!("wss://api.deepgram.com/v1/listen?{query}");

    let _ = app.emit(
        status_evt,
        SttStatusPayload {
            status: "connecting".into(),
            error: None,
        },
    );
    emit_system_health(&app, system_health.as_ref(), my_gen, "starting");

    let mut req = match dg_url.as_str().into_client_request() {
        Ok(r) => r,
        Err(e) => {
            eprintln!("[{tag}] request build FAILED: {e}");
            running.store(false, Ordering::SeqCst);
            let _ = app.emit(
                status_evt,
                SttStatusPayload {
                    status: "error".into(),
                    error: Some(format!("Deepgram request build failed: {e}")),
                },
            );
            return;
        }
    };
    // Auth is set EXACTLY ONCE here. The query string contains no `token=`
    // param and no `Sec-WebSocket-Protocol` subprotocol token, so Deepgram
    // sees a single, unambiguous credential.
    let auth_value = match format!("Token {}", cfg.api_key.trim()).parse() {
        Ok(v) => v,
        Err(e) => {
            eprintln!("[{tag}] Authorization header invalid: {e}");
            running.store(false, Ordering::SeqCst);
            let _ = app.emit(
                status_evt,
                SttStatusPayload {
                    status: "error".into(),
                    error: Some("Deepgram API key contains invalid characters".into()),
                },
            );
            return;
        }
    };
    req.headers_mut().insert(AUTHORIZATION, auth_value);

    let ws = match connect_async(req).await {
        Ok((ws, _resp)) => ws,
        Err(e) => {
            // For HTTP failures (400/401/403), tungstenite's Error::Http variant
            // carries the response with the body. Deepgram puts a JSON error
            // message there (e.g. `{"err_code":"INVALID_AUTH","err_msg":"..."}`)
            // — surface it so the user sees the real reason rather than a
            // generic "HTTP error".
            let detail = match &e {
                tokio_tungstenite::tungstenite::Error::Http(resp) => {
                    let status = resp.status();
                    let body = resp
                        .body()
                        .as_ref()
                        .map(|b| String::from_utf8_lossy(b).into_owned())
                        .unwrap_or_default();
                    let body_trim = body.trim();
                    if body_trim.is_empty() {
                        format!("HTTP {status}")
                    } else {
                        format!("HTTP {status}: {body_trim}")
                    }
                }
                other => other.to_string(),
            };
            eprintln!("[{tag}] Deepgram connect FAILED: {detail}");
            running.store(false, Ordering::SeqCst);
            if let Some(h) = system_health {
                h.deepgram_running.store(false, Ordering::SeqCst);
            }
            let _ = app.emit(
                status_evt,
                SttStatusPayload {
                    status: "error".into(),
                    error: Some(format!("Deepgram connect failed: {detail}")),
                },
            );
            emit_system_health(&app, system_health.as_ref(), my_gen, "error");
            return;
        }
    };

    if let Some(h) = system_health {
        h.deepgram_running.store(true, Ordering::SeqCst);
    }
    eprintln!("[{tag}] systemDeepgramConnected");
    emit_system_health(&app, system_health.as_ref(), my_gen, "connected");

    let _ = app.emit(
        status_evt,
        SttStatusPayload {
            status: "transcribing".into(),
            error: None,
        },
    );

    let (mut write, mut read) = ws.split();

    // Reader task communicates back to the send loop via a oneshot so the
    // writer can stop promptly when Deepgram closes or errors. Without this
    // the writer would only learn about a dead socket on the next KeepAlive
    // or PCM send (up to 8 s of silence).
    let (reader_done_tx, mut reader_done_rx) =
        tokio::sync::oneshot::channel::<ExitReason>();
    let app_r = app.clone();
    let reader_gen = my_gen;
    let reader_health = system_health;
    tokio::spawn(async move {
        let mut sender = Some(reader_done_tx);
        let send_once = |s: &mut Option<tokio::sync::oneshot::Sender<ExitReason>>,
                         reason: ExitReason| {
            if let Some(tx) = s.take() {
                let _ = tx.send(reason);
            }
        };

        loop {
            if generation.load(Ordering::Relaxed) != reader_gen {
                send_once(&mut sender, ExitReason::UserStop);
                break;
            }
            let msg = match read.next().await {
                Some(m) => m,
                None => {
                    send_once(&mut sender, ExitReason::RemoteClose(None));
                    break;
                }
            };
            match msg {
                Ok(WsMsg::Text(text)) => {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&text) {
                        if val["type"] == "Results" {
                            let is_final = val["is_final"].as_bool().unwrap_or(false);
                            let transcript = val["channel"]["alternatives"][0]["transcript"]
                                .as_str()
                                .unwrap_or("")
                                .to_string();
                            let text_len = transcript.trim().len();
                            if is_final {
                                if let Some(h) = reader_health {
                                    if text_len == 0 {
                                        h.empty_final_streak.fetch_add(1, Ordering::SeqCst);
                                    } else {
                                        h.empty_final_streak.store(0, Ordering::SeqCst);
                                    }
                                    emit_system_health(&app_r, Some(&h), reader_gen, "connected");
                                }
                            } else if text_len > 0 {
                                eprintln!(
                                    "[{tag}] interimReceived sourcePlatform=tauri channel={} textLength={}",
                                    tag, text_len
                                );
                                if let Some(h) = reader_health {
                                    h.empty_final_streak.store(0, Ordering::SeqCst);
                                    emit_system_health(&app_r, Some(&h), reader_gen, "connected");
                                }
                            }

                            // Emit final boundaries even when transcript text is empty.
                            // This allows frontend fallback logic to reconcile interim
                            // text when Deepgram sends an empty/weak final frame.
                            if is_final || text_len > 0 {
                                let _ = app_r.emit(
                                    transcript_evt,
                                    TranscriptPayload {
                                        text: transcript,
                                        is_final,
                                    },
                                );
                            }
                        }
                    }
                }
                Ok(WsMsg::Close(frame)) => {
                    let owned = frame.map(|f| CloseFrame {
                        code: f.code,
                        reason: f.reason.into_owned().into(),
                    });
                    send_once(&mut sender, ExitReason::RemoteClose(owned));
                    break;
                }
                Ok(_) => {} // Ping/Pong/Binary from server: ignore
                Err(e) => {
                    send_once(&mut sender, ExitReason::ReadError(e.to_string()));
                    break;
                }
            }
        }
    });

    // ── Send loop: KeepAlive + PCM, stops on user stop / reader exit / error.
    let mut ka = tokio::time::interval(Duration::from_secs(8));
    let mut health_tick = tokio::time::interval(Duration::from_secs(2));
    let exit_reason = loop {
        if !running.load(Ordering::Relaxed)
            || generation.load(Ordering::Relaxed) != my_gen
        {
            break ExitReason::UserStop;
        }
        tokio::select! {
            biased;
            // Reader signalled remote close / read error → exit immediately
            // with the reader's reason.
            reason = &mut reader_done_rx => {
                break reason.unwrap_or(ExitReason::RemoteClose(None));
            }
            _ = ka.tick() => {
                if let Err(e) = write
                    .send(WsMsg::Text(r#"{"type":"KeepAlive"}"#.to_string()))
                    .await
                {
                    eprintln!("[{tag}] KeepAlive send FAILED: {e}");
                    break ExitReason::SendError(e.to_string());
                }
            }
            _ = health_tick.tick() => {
                emit_system_health(&app, system_health.as_ref(), my_gen, "connected");
            }
            result = pcm_rx.recv() => {
                match result {
                    Ok(pcm) => {
                        if let Some(h) = system_health {
                            h.pcm_frames_sent.fetch_add(1, Ordering::SeqCst);
                        }
                        if let Err(e) = write.send(WsMsg::Binary((*pcm).clone())).await {
                            eprintln!("[{tag}] PCM send FAILED: {e}");
                            break ExitReason::SendError(e.to_string());
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(_n)) => {
                        continue;
                    }
                    Err(broadcast::error::RecvError::Closed) => {
                        break ExitReason::BroadcastClosed;
                    }
                }
            }
        }
    };

    // Best-effort graceful close — ignore failures, the socket may already be dead.
    let _ = write.send(WsMsg::Close(None)).await;

    running.store(false, Ordering::SeqCst);
    if let Some(h) = system_health {
        h.deepgram_running.store(false, Ordering::SeqCst);
    }
    eprintln!("[{tag}] systemDeepgramExited");

    // If the user stopped, prefer "idle" even if the reader reported a remote
    // close that arrived in the same instant.
    let final_reason = if !running.load(Ordering::SeqCst)
        && matches!(exit_reason, ExitReason::UserStop)
    {
        ExitReason::UserStop
    } else {
        exit_reason
    };
    let final_state = if matches!(final_reason, ExitReason::UserStop) {
        "stopped"
    } else {
        "error"
    };
    let payload = final_reason.into_status();
    let _ = app.emit(status_evt, payload);
    emit_system_health(&app, system_health.as_ref(), my_gen, final_state);
}
