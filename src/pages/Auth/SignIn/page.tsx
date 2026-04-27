import { useState } from "react";
import { useSignIn, useClerk } from "@clerk/clerk-react";
import { Link, useNavigate } from "react-router-dom";
import { GoogleOAuthButton } from "@/components/GoogleOAuthButton";

type Step = "email" | "password";

const SignInPage = () => {
  const { isLoaded, signIn, setActive } = useSignIn();
  const { signOut } = useClerk();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;
    setError("");
    setLoading(true);
    try {
      const result = await signIn!.create({ identifier: email });
      if (result.status === "complete") {
        await setActive!({ session: result.createdSessionId });
        navigate("/dashboard");
      } else {
        // Needs password or other factor
        setStep("password");
      }
    } catch (err: unknown) {
      const e = err as { errors?: { message: string }[] };
      setError(e?.errors?.[0]?.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;
    setError("");
    setLoading(true);
    try {
      const result = await signIn!.attemptFirstFactor({
        strategy: "password",
        password,
      });
      if (result.status === "complete") {
        await setActive!({ session: result.createdSessionId });
        navigate("/dashboard");
      } else {
        setError("Sign-in incomplete. Please try again.");
      }
    } catch (err: unknown) {
      const e = err as { errors?: { message: string }[] };
      setError(e?.errors?.[0]?.message ?? "Incorrect password");
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setStep("email");
    setPassword("");
    setError("");
    signOut();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-white p-4">
      <div className="w-full max-w-md rounded-2xl shadow-xl border border-slate-100 bg-white">
        {/* Header */}
        <div className="px-8 pt-8 pb-6 text-center">
          <h1 className="text-xl font-semibold text-slate-900">Sign in to ScribeShade</h1>
          <p className="mt-1.5 text-sm text-slate-500">Welcome back! Please sign in to continue</p>
        </div>

        {/* Google button — only on email step */}
        {step === "email" && (
          <>
            <div className="px-8 pb-4">
              <GoogleOAuthButton label="Continue with Google" />
            </div>
            <div className="flex items-center gap-3 px-8 pb-5">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="text-xs font-medium text-slate-400">or</span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>
          </>
        )}

        {/* Forms */}
        <div className="px-8 pb-8">
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-2.5">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {step === "email" ? (
            <form onSubmit={handleEmailSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="email" className="block text-sm font-medium text-slate-700">Email address</label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !isLoaded}
                className="w-full h-10 rounded-lg bg-blue-600 text-sm font-medium text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Checking…" : "Continue"}
              </button>
            </form>
          ) : (
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="text-sm font-medium text-slate-700">Password</label>
                </div>
                <input
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !isLoaded}
                className="w-full h-10 rounded-lg bg-blue-600 text-sm font-medium text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Signing in…" : "Sign in"}
              </button>
              <button
                type="button"
                onClick={handleBack}
                className="w-full text-sm text-slate-500 hover:text-slate-700 transition"
              >
                ← Use a different account
              </button>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-slate-500">
            Don&apos;t have an account?{" "}
            <Link to="/sign-up" className="font-medium text-blue-600 hover:text-blue-500 transition">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default SignInPage;

