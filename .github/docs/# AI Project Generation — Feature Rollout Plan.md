TOP level modules needed -> [All this sections, in report format]

Resume-Ready Bullets
Introduction
How to Explain This Project
Project Header
Business Purpose
Architecture Diagram
Data Flow Diagram
Important and complex sections code snippets 
Cluster & Node Details
Tools & Technologies
Data Characteristics
Database Schema
Tool Integration Map
Why These Tools
Methodology
CI/CD Pipeline
Environment Setup
Monitoring & Alerting
Challenges & Resolution
Production Issues
Performance Optimization
Key Achievements
Technical Learnings


# AI Project Generation — Feature Rollout Plan

## Overview

| Field | Details |
|-------|---------|
| Feature | AI Project Generation Engine |
| Priority | Medium |
| Version | v1.0 |
| Inputs | Resume skills, Job Description, Role type |
| Outputs | Full project narrative, Diagram block, 30-sec summary |

---

## Roles & Responsibilities

| Role | Responsibility |
|------|---------------|
| Product Manager | Define scope, acceptance criteria, prioritization |
| Backend Developer | AI prompt engineering, API endpoint, caching logic |
| Frontend Developer | Tree node UI, editor integration, expand/collapse nodes |
| AI/LLM Engineer | Model selection, prompt tuning, hallucination guard |
| QA Engineer | Test edge cases, skill mismatch, credibility warnings |
| UI/UX Designer | Tree node wireframes, STAR layout, 30-sec summary card |

---

## Phase 1 — Foundation (Week 1–2)

### Backend Developer
- [ ] Create `/api/ai/project-generation` POST endpoint
- [ ] Define request schema:
  ```json
  {
    "resume_skills": ["React", "Node.js", "PostgreSQL"],
    "jd_text": "...",
    "role_type": "Full Stack Developer",
    "experience_level": "mid"
  }
  ```
- [ ] Integrate with OpenRouter → Gemini 1.5 Pro
- [ ] Implement skill extraction parser from resume `parsed_data` JSON
- [ ] Log to `credit_usage` table (4 credits per generation)

### AI/LLM Engineer
- [ ] Design master prompt template covering:
  - STAR format (Situation, Task, Action, Result)
  - Specific tech stack injection
  - Measurable outcomes (performance %, scale numbers)
  - Human-like, non-generic language
- [ ] Add hallucination guard — detect unrealistic claims
- [ ] Add skill mismatch detection — limit scope to existing stack
- [ ] Test prompt with 5+ role types (Frontend, Backend, DevOps, Data, Full Stack)

### UI/UX Designer
- [ ] Wireframe the Project Generation modal (3 input fields)
- [ ] Design tree node component (expand/collapse)
- [ ] Design STAR story card layout
- [ ] Design 30-second summary card
- [ ] Design credibility warning banner

---

## Phase 2 — Core Feature Build (Week 3–4)

### Backend Developer
- [ ] Build predefined project category engine (FR-PROJ-06):
  ```
  Categories: Web App, API Service, Data Pipeline,
  Mobile App, DevOps/Infrastructure, ML Model, CLI Tool
  ```
- [ ] Implement output schema:
  ```json
  {
    "project_title": "...",
    "narrative": "...",
    "star_story": {
      "situation": "...",
      "task": "...",
      "action": "...",
      "result": "..."
    },
    "architecture": {
      "frontend": "...",
      "backend": "...",
      "database": "...",
      "infrastructure": "..."
    },
    "ascii_diagram": "...",
    "thirty_sec_summary": "...",
    "memory_hooks": ["...", "..."],
    "credibility_score": 0-100
  }
  ```
- [ ] Store generated project in `resumes.parsed_data` under `projects[]`

### Frontend Developer
- [ ] Build Project Generation trigger button inside Resume Editor
- [ ] Build input modal (resume skills auto-filled, JD + role inputs)
- [ ] Build **Tree Node View** component:
  ```
  Project Name
  ├── Frontend → React, Tailwind
  ├── Backend  → Node.js, Express
  ├── Database → PostgreSQL
  └── Infra    → Docker, Vercel
  ```
- [ ] Implement expand/collapse per node (FR-PROJ-10)
- [ ] Render ASCII diagram in monospace block
- [ ] Build STAR story card (4 labeled sections)
- [ ] Build 30-second summary card with copy button

### AI/LLM Engineer
- [ ] Fine-tune prompt for ASCII diagram generation:
  ```
  [Frontend: React] → [Backend: Express API] → [DB: PostgreSQL]
                                ↓
                       [Cache: Redis]
  ```
- [ ] Implement memory hooks generator (short memorable phrases per architecture decision)
- [ ] Add FR-PROJ-07 logic — generate projects partially independent of resume/JD
  (use role-type defaults when inputs are sparse)

---

## Phase 3 — Exception Handling & Guards (Week 5)

### Backend Developer
- [ ] **Skill Mismatch Handler:**
  - Compare requested tech stack against `metadata_index.skills`
  - If mismatch > 40% → auto-limit project scope to known skills
  - Return `scope_limited: true` flag in response
- [ ] **Credibility Warning System:**
  - Detect unrealistic claims (e.g., "handled 10M users" for fresher)
  - Return `credibility_warning: true` + `warning_message` in response
- [ ] Add input validation — minimum 2 skills required to generate

### Frontend Developer
- [ ] Show **Credibility Warning Banner** (yellow) when `credibility_warning: true`:
  > ⚠️ "Some outcomes may seem ambitious for your experience level. Review before adding."
- [ ] Show **Scope Limited Notice** (blue) when `scope_limited: true`:
  > ℹ️ "Project scope adjusted to match your current skill set."
- [ ] Disable generate button with tooltip if fewer than 2 skills detected

### QA Engineer
- [ ] Write test cases for:
  - Fresher with minimal skills → scope limiting
  - Senior with full stack → full project generation
  - Empty JD input → role-type defaults kick in
  - Unrealistic outcome detection (e.g., "reduced latency by 1000%")
  - Tree node expand/collapse functionality
  - Credit deduction (4 credits) accuracy

---

## Phase 4 — Integration & Polish (Week 6)

### Frontend Developer
- [ ] Integrate generated project into Resume Editor with **Apply / Discard** buttons
- [ ] Add project to left panel Section Navigator after apply
- [ ] Lock generated `project_name` and `project_dates` fields post-apply (locked field rule)
- [ ] Add "Regenerate" option (costs 4 more credits, not cached)

### Backend Developer
- [ ] Add predefined categories dropdown API:
  `GET /api/project-categories?role_type=fullstack`
- [ ] Implement rate limiting — max 5 generations per session

### AI/LLM Engineer
- [ ] A/B test two prompt variants for naturalness
- [ ] Evaluate output across 10 role types
- [ ] Document final prompt template in internal wiki

### Product Manager
- [ ] Define acceptance criteria sign-off checklist
- [ ] Conduct internal demo with stakeholders
- [ ] Collect beta user feedback (5 testers minimum)

---

## API Contract

### Request
```http
POST /api/ai/project-generation
Authorization: Bearer <token>
Content-Type: application/json

{
  "resume_id": "uuid",
  "role_type": "Full Stack Developer",
  "jd_text": "optional JD paste",
  "experience_level": "mid"
}
```

### Response
```json
{
  "project_title": "Real-Time Order Tracking Dashboard",
  "narrative": "Built a full-stack order tracking system...",
  "star_story": {
    "situation": "E-commerce client needed real-time visibility...",
    "task": "Design and build a tracking dashboard from scratch...",
    "action": "Developed using React frontend, Node.js API, PostgreSQL...",
    "result": "Reduced support tickets by 35% within 2 months..."
  },
  "architecture": {
    "frontend": "React, Tailwind CSS",
    "backend": "Node.js, Express",
    "database": "PostgreSQL",
    "infrastructure": "Docker, Vercel"
  },
  "ascii_diagram": "[React UI] → [Express API] → [PostgreSQL]\n                    ↓\n              [Redis Cache]",
  "thirty_sec_summary": "Built a real-time order dashboard using React and Node.js...",
  "memory_hooks": ["REST over WebSocket for simplicity", "Redis as the speed layer"],
  "credibility_score": 82,
  "credibility_warning": false,
  "scope_limited": false,
  "credits_consumed": 4
}
```

---

## Exception Handling Matrix

| Exception | Trigger | System Response | UI Display |
|-----------|---------|-----------------|------------|
| Skill Mismatch | >40% tech stack not in resume | Limit to known skills, `scope_limited: true` | Blue info banner |
| Unrealistic Claims | Outcome % too high for experience | `credibility_warning: true` + message | Yellow warning banner |
| Insufficient Skills | <2 skills detected | Block generation | Disabled button + tooltip |
| Empty JD & Role | Both inputs missing | Use role-type category defaults | Silent fallback |
| AI Model Failure | OpenRouter timeout/error | Retry once, then 503 response | Toast error message |

---

## Functional Requirements Checklist

| FR ID | Requirement | Phase | Status |
|-------|------------|-------|--------|
| FR-PROJ-01 | Generate realistic projects aligned with skills | Phase 1 | 🔲 |
| FR-PROJ-02 | Include architecture breakdown | Phase 2 | 🔲 |
| FR-PROJ-03 | Include STAR format | Phase 2 | 🔲 |
| FR-PROJ-04 | Generate ASCII diagrams | Phase 2 | 🔲 |
| FR-PROJ-05 | Generate memory hooks | Phase 2 | 🔲 |
| FR-PROJ-06 | Predefined project categories by industry role | Phase 2 | 🔲 |
| FR-PROJ-07 | Projects not fully dependent on resume/JD | Phase 2 | 🔲 |
| FR-PROJ-08 | Tree node structure for project components | Phase 2 | 🔲 |
| FR-PROJ-09 | Tree displays Frontend→Backend→DB→Infra layers | Phase 2 | 🔲 |
| FR-PROJ-10 | Expand/collapse nodes | Phase 2 | 🔲 |

---

## Timeline Summary

| Phase | Duration | Owner |
|-------|----------|-------|
| Phase 1 — Foundation | Week 1–2 | Backend + AI/LLM Engineer |
| Phase 2 — Core Build | Week 3–4 | All Roles |
| Phase 3 — Guards & Edge Cases | Week 5 | Backend + Frontend + QA |
| Phase 4 — Integration & Polish | Week 6 | All Roles |
| **Total** | **6 Weeks** | |
```


Here is the complete **AI Project Generator UI spec + Working Dynamics** for CraftVita, based on both the PRD and the live UI screenshots:

***

```markdown
# CraftVita — AI Project Generator
## UI Specification & Working Dynamics

---

## Overview

The AI Project Generator is a standalone workspace tool (not inside Resume Builder)
that generates deep, interview-ready project documentation for job seekers.

Input: Role type + Industry + Experience years
Output: 22 structured sections — from resume bullets to architecture diagrams,
CI/CD pipelines, challenges, performance metrics, and technical learnings.

---

## Navigation & Entry Point

```
Sidebar (Left Panel)
├── Dashboard
├── ✦ Project Generator     ← [NEW] badge
├── Resume Builder
├── Interview Prep
└── Analytics
```

- Accessible from main sidebar at all times
- "New" badge indicating it's a recently launched feature
- User profile shown at bottom: Name, Plan, Credit balance

---

## Screen 1 — Project Generator Input

### Top Bar
```
← Back  |  ✦ Generated project · [Role] · [Industry] · [Experience]     Share  |  ⬇ Export PDF
```

### Role Type Selector (EXAMPLE section)

Two-tab toggle showing example personas:

| Tab | Label | Detail |
|-----|-------|--------|
| Active (dark dot) | Technical: Data Engineer | Banking · 5–8 years |
| Inactive (light dot) | Non-Technical: Marketing Manager | Consumer Goods / FMCG |

> These are example presets. Users can define their own custom role + industry + experience.

### Input Fields (Modal or Inline Form)
```
┌─────────────────────────────────────────────┐
│  Role Type          [ Data Engineer       ▼ ]│
│  Industry           [ Banking & Financial ▼ ]│
│  Experience Level   [ 5–8 years           ▼ ]│
│                                              │
│  Resume Skills      [Auto-filled from resume]│
│  Job Description    [Paste JD — optional   ] │
│                                              │
│         [ ✦ Generate Project  · 4 credits ] │
└─────────────────────────────────────────────┘
```

---

## Screen 2 — Generated Project Output (22 Sections)

All sections rendered on a single scrollable page.
Each section has a numbered badge (teal circle) + section title + subtitle.

---

### Section 01 — Resume-Ready Bullets
*Drop directly onto your resume*

- Bullet list of 4–5 achievement-oriented statements
- STAR format with metrics (%, $, volume, latency)
- `Copy to clipboard` button (top right of card)

**Example output:**
```
-  Architected real-time fraud detection pipeline processing 2.3M transactions/day
  using Kafka, Spark Streaming, and XGBoost on AWS EMR, reducing detection
  latency from 45 minutes to 2.8 seconds

-  Designed and deployed feature store on Redis serving pre-computed ML features
  at sub-millisecond latency, enabling real-time scoring with 97.3% precision

-  Built data quality framework using Great Expectations with 47 validation rules,
  reducing upstream data issues by 78%

-  Saved $3.1M annually in fraud losses and reduced false positive rate by 62%,
  freeing 4,200 analyst hours/year
```

---

### Section 02 — Introduction
*Full project narrative paragraph*

- 3–4 sentence professional summary
- Bold key metrics and outcomes inline
- Written in first person ("As Lead Data Engineer, I architected...")
- No copy button — flows into Section 03

---

### Section 03 — How to Explain This Project
*A conversational walkthrough — exactly how you'd tell it in an interview*

- `⏱ ~2.5 min read-aloud` tag (top left)
- `Copy` button (top right)
- Rendered as blockquote / quoted paragraphs
- Written in natural spoken English (not formal resume language)
- Covers: problem → approach → challenges → result
- Includes real production incidents and how they were resolved

---

### Section 04 — Project Header
*Metadata card row*

Horizontal card with 6 metadata fields:

| Field | Icon | Example Value |
|-------|------|---------------|
| PROJECT | 🗂 | Real-Time Fraud Detection |
| DOMAIN | 🏢 | Banking & Financial |
| DURATION | 📅 | Aug '24 – Jan '25 · 6 mo |
| TEAM | 👥 | 6 members |
| ROLE | 👤 | Lead Data Engineer |
| CLIENT | ⭕ | Risk Management Div. |

**Team Composition line:**
```
2 Backend Engineers · 2 Data Engineers · 1 ML Engineer · 1 DevOps Engineer
```

---

### Section 05 — STAR Story
*(Situation · Task · Action · Result)*

Four labeled blocks:

```
SITUATION
The existing rule-based system had a 45-minute detection lag and 38% false
positive rate, costing $4.2M annually...

TASK
Design and build a streaming fraud detection pipeline to reduce detection
latency to under 5 seconds while maintaining >95% precision...

ACTION
Set up Debezium CDC on Oracle DB → Kafka (5 brokers, 24 partitions) →
Spark Structured Streaming → Redis feature store → XGBoost scoring...

RESULT
Fraud detection: 45 min → 2.8 sec. Precision: 97.3%. Savings: $3.1M/yr.
False positives reduced by 62%.
```

---

### Section 06 — 30-Second Summary
*Memory hook for quick recall*

- Short 3–4 sentence paragraph
- Designed to be memorized and spoken in elevator pitch format

---

### Section 07 — Data Flow Diagram
*Seven-stage pipeline from ingestion to alerting*

Expandable step cards (click `>` to expand each):

| Step | Title | Description |
|------|-------|-------------|
| 1 | Data Capture | Debezium CDC captures changes from Oracle core banking DB |
| 2 | Ingestion | Kafka Streams — raw_transactions topic, 24 partitions, 7-day retention |
| 3 | Processing | Spark Structured Streaming — dedup, enrich, feature engineering |
| 4 | Storage | PostgreSQL (clean tables) + S3 Data Lake (Parquet, daily partitioned) |
| 5 | ML Scoring | XGBoost scores each transaction in real-time via Redis feature cache |
| 6 | Alerting | Flagged transactions trigger alerts, routed to fraud analysts |
| 7 | Monitoring | Grafana dashboards + PagerDuty alerting |

> Each step is a collapsible card with `>` expand arrow on the right.

---

### Section 08 — Cluster & Node Details
*Infrastructure specifications*

Four cards in 2×2 grid:

#### EMR Cluster
| Field | Value |
|-------|-------|
| Masters | 3 × m5.xlarge |
| Workers | 12 × r5.2xlarge |
| Auto-scaling | 8–16 nodes |

#### Kafka Cluster
| Field | Value |
|-------|-------|
| Brokers | 5 |
| ZooKeeper | 3 nodes |
| Partitions / topic | 24 |

#### Redis Cluster
| Field | Value |
|-------|-------|
| Topology | 3-node cluster |
| Memory | 6 GB |
| Replication | Read replicas |

#### PostgreSQL (RDS)
| Field | Value |
|-------|-------|
| Instance | r5.2xlarge |
| Availability | Multi-AZ |
| Storage | 500 GB gp3 |

---

### Section 09 — Tools & Technologies
*Grouped by layer · 40+ technologies across the stack*

Tag-based display, color-coded by category:

| Layer | Technologies |
|-------|-------------|
| Languages | Python 3.11, SQL, Scala 2.13 |
| Data Ingestion | Kafka 3.5, Debezium 2.4, Kafka Connect |
| Data Processing | Spark 3.5, Spark Streaming, PySpark |
| Databases | PostgreSQL 15, Redis 7, S3 (Parquet) |
| Cloud | AWS EMR, EC2, RDS, S3, Lambda, CloudWatch |
| ML / AI | XGBoost, Scikit-learn, MLflow |
| DevOps | Docker, Jenkins, Terraform, GitHub Actions |
| Monitoring | Grafana, Prometheus, PagerDuty, CloudWatch |
| Data Quality | Great Expectations |
| Collaboration | JIRA, Confluence, Slack, Git |

> Color coding: green = primary tech, yellow = cloud, red = data quality, blue = default

---

### Section 10 — Data Characteristics

Five stat cards in a row:

| Metric | Value | Detail |
|--------|-------|--------|
| DAILY VOLUME | 2.3M transactions/day | ~47 GB raw |
| PEAK THROUGHPUT | 4,200 events/sec | Black-Friday peak |
| HISTORICAL | 850M records | 2.4 TB total |
| DATA SOURCES | 3 upstream | Core Banking, Gateway, Card Nets |
| RETENTION | 7yr cold | Hot 90d · Warm 1y |

---

### Section 11 — Database Schema
*Core tables powering the detection pipeline*

| TABLE | KEY COLUMNS | RECORDS | PURPOSE |
|-------|-------------|---------|---------|
| transactions | txn_id, account_id, amount, merchant_id, timestamp, channel | 2.3M/day | Core transaction data |
| accounts | account_id, customer_id, account_type, balance, risk_score | 12M | Customer accounts |
| fraud_labels | txn_id, is_fraud, detection_method, flagged_at | 800K | ML training labels |
| features | txn_id, velocity_1hr, avg_amount_7d, distance_from_home | 2.3M/day | ML feature store |
| alerts | alert_id, txn_id, severity, status, assigned_to | 15K/day | Alert management |
| model_metrics | model_version, accuracy, precision, recall, f1 | 52/year | Model tracking |

---

### Section 12 — Tool Integration Map
*How the pieces talk to each other*

- Debezium CDC captures from Oracle → pushes to Kafka topics
- Spark consumes from Kafka via Structured Streaming API
- Spark writes to PostgreSQL via JDBC — batch upserts, 5,000 rows/batch
- Spark writes to S3 as Parquet — daily partitioned by date
- dbt runs transformations on PostgreSQL — scheduled via Airflow DAG
- Redis serves pre-computed features to the ML scoring service
- Grafana connects to PostgreSQL read-replica + Prometheus metrics
- PagerDuty receives alerts from Grafana alert rules

---

### Section 13 — Why These Tools
*Trade-off decisions and rationale*

Side-by-side comparison cards:

| Decision | Winner | Loser | Rationale |
|----------|--------|-------|-----------|
| Message queue | Kafka | RabbitMQ | Needed replay capability (7-day retention) and throughput exceeded RabbitMQ's single-queue limit |
| Database | PostgreSQL | MongoDB | Queries are heavily relational — multi-table joins drive fraud scoring logic |

---

### Section 14 — Architecture Diagram
*ASCII / Tree node view*

```
[Oracle Core DB]
      ↓ Debezium CDC
[Kafka Cluster · 5 brokers · 24 partitions]
      ↓ Structured Streaming
[Spark EMR · 12 workers · r5.2xlarge]
      ↓                    ↓
[Redis Feature Store]   [PostgreSQL RDS]
      ↓                    ↓
[XGBoost Scoring]      [S3 Data Lake]
      ↓
[Alert Engine]
      ↓
[Grafana + PagerDuty]
```

Tree node view (expandable per layer):
```
Project Root
├── Data Layer
│   ├── Oracle DB (source)
│   └── Debezium CDC (capture)
├── Streaming Layer
│   ├── Kafka (transport)
│   └── Spark (processing)
├── Storage Layer
│   ├── PostgreSQL (structured)
│   └── S3 Parquet (lake)
├── ML Layer
│   ├── Redis (feature cache)
│   └── XGBoost (scoring)
└── Ops Layer
    ├── Grafana (monitoring)
    └── PagerDuty (alerting)
```

---

### Section 15 — CI/CD Pipeline

Linear flow:

```
Git Push → Jenkins (Lint + Unit Tests) → Docker Build → ECR Push → ECS Deploy (Blue-Green)
Trigger     Lint + Unit Tests             Image creation   Image registry   Blue-Green

Coverage: 80% minimum  |  Frequency: 2–3 deploys/week  |  Rollback: < 2 min
```

---

### Section 16 — Environment Setup

Four environment cards:

| Environment | Config |
|-------------|--------|
| DEV | Single-node Spark, local PostgreSQL |
| QA | 3-node cluster, synthetic data |
| STAGING | Production mirror, 10% traffic |
| PROD | Full cluster, live data |

---

### Section 17 — Monitoring & Alerting

**Grafana**
- Pipeline latency (p50, p95, p99)
- Throughput (events/sec)
- EMR cluster utilization
- RDS connection pool
- S3 transfer rate
- Lambda cold-start metrics

**PagerDuty**
- Pipeline delay > 15 min → P2
- Data quality failure → P1
- 99.7% uptime target
- < 5 sec detection p95
- Weekly stakeholder report
- Quarterly resilience review

---

### Section 18 — Challenges & Resolutions

Three challenge cards:

#### Challenge 1: Spark OOM on Historical Backfill
- **Root Cause:** Skewed partition on merchant_id — Amazon alone represented 34% of records
- **Resolution:** Salted partition key, repartitioned to 480, reduced executor memory 16GB → 8GB, doubled executor count

#### Challenge 2: Upstream Schema Break
- **Root Cause:** Oracle DBA added 3 columns without notification — broke Debezium connector
- **Resolution:** Implemented Confluent Schema Registry and added upstream change-notification process

#### Challenge 3: ML Model Drift
- **Root Cause:** Fraud patterns changed quarterly; model accuracy dropped from 97% to 91%
- **Resolution:** Automated weekly retraining pipeline with MLflow + A/B testing for model versions

---

### Section 19 — Production Issues
*Timeline of real incidents and fixes*

- WEEK 2 · P1 — Schema migration broke Debezium connector (4 hr downtime)
- Resolution: Confluent Schema Registry implemented same week

---

### Section 20 — Performance Optimization

Three metric cards (before → after):

| Metric | Before | After | Method |
|--------|--------|-------|--------|
| Processing Time | 3.2 hrs | 22 min | Broadcast join, CSV→Parquet, partition pruning |
| Query Latency | 12s | 800 ms | Indexed views, connection pooling |
| Storage Cost | $2,400/mo | $1,100/mo | Parquet compression, lifecycle policies |

---

### Section 21 — Key Achievements

Six stat cards:

| Metric | Value | Context |
|--------|-------|---------|
| Fraud detection speed | 2.8 sec | was 45 min |
| Precision | 97.3% | target 95% |
| Volume | 2.3M txns/day | processed |
| Uptime | 99.7% | pipeline |
| Cost savings | $3.1M | saved annually |
| False positives | 62% fewer | analyst hours saved |

---

### Section 22 — Technical Learnings
*What I'd do differently next time*

Three quote cards:

> Would implement Schema Registry from Day 1 — schema drift was our #1 source of
> production incidents.

> Would use Delta Lake instead of raw Parquet for ACID guarantees and time-travel
> debugging.

> Would set up cost monitoring earlier — EMR exceeded budget by 20% in Month 2
> before we caught it.

---

## Working Dynamics — How It All Works

```
User selects Role + Industry + Experience
              ↓
System fetches resume skills from parsed_data (auto-injected)
              ↓
User pastes optional JD text
              ↓
Click "Generate Project" (4 credits deducted)
              ↓
POST /api/ai/project-generation
{
  role_type, industry, experience_level,
  resume_skills[], jd_text (optional)
}
              ↓
Gemini 1.5 Pro processes with master prompt
              ↓
Returns structured JSON (22 sections)
              ↓
Frontend renders each section as individual UI component
              ↓
     ┌────────────────────────────────┐
     │  User can:                     │
     │  -  Copy bullets → Resume       │
     │  -  Export PDF (full document)  │
     │  -  Share link                  │
     │  -  Expand/collapse tree nodes  │
     └────────────────────────────────┘
```

---

## Credit & Caching Rules

| Action | Credits | Notes |
|--------|---------|-------|
| Generate project (first time) | 4 | Full Gemini 1.5 Pro call |
| Regenerate (same inputs) | 4 | Not cached — always fresh |
| Copy bullets | FREE | No AI call |
| Export PDF | FREE | Puppeteer render |
| Share link | FREE | Static URL |

---

## Export PDF Layout

When user clicks "Export PDF":
- Top bar: Project title + role + industry + date
- All 22 sections rendered in order
- Tree diagrams converted to indented text
- Stat cards rendered as compact tables
- Code blocks preserved in monospace
- Clean white background, ATS-safe font
```