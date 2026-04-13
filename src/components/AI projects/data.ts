// ─── Type Definitions ───────────────────────────────────────────────────────

export interface ArchitectureLayer {
  name: string;
  technologies: string[];
  description: string;
}

export interface FlowStep {
  id: string;
  title: string;
  description: string;
  icon: string; // lucide icon key
}

export interface TechItem {
  name: string;
  icon: string;
  role: string;
}

export interface TechCategory {
  category: string;
  items: TechItem[];
}

export interface CollabTool {
  name: string;
  purpose: string;
  icon: string;
}

export interface DataDomain {
  domain: string;
  size: string;
  description: string;
  color: string; // for bar visual
}

export interface TableAttribute {
  name: string;
  type: string;
  constraints: string;
}

export interface DatabaseTable {
  name: string;
  attributes: TableAttribute[];
}

export interface DatabaseSchema {
  dbType: string;
  tables: DatabaseTable[];
}

export interface SystemProject {
  id: string;
  title: string;
  overview: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  estimatedTime: string;

  architecture: {
    pattern: string;
    description: string;
    layers: ArchitectureLayer[];
  };

  projectFlow: FlowStep[];

  techStack: TechCategory[];
  collaborationTools: CollabTool[];

  purpose: string;
  businessPurpose: string;
  targetAudience: string;

  dataDomains: DataDomain[];
  database: DatabaseSchema;
}

// ─── Dummy Projects ─────────────────────────────────────────────────────────

export const systemProjects: SystemProject[] = [
  // ━━━ PROJECT 1: AI-Powered E-Commerce Platform ━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: "proj-ecom",
    title: "AI-Powered E-Commerce Platform",
    overview:
      "A full-stack e-commerce platform with AI-driven product recommendations, real-time inventory management, and intelligent search powered by vector embeddings.",
    difficulty: "advanced",
    estimatedTime: "8-10 weeks",

    architecture: {
      pattern: "Microservices",
      description:
        "Event-driven microservices architecture with API Gateway, message queues for async processing, and a shared data lake for analytics.",
      layers: [
        {
          name: "Client Layer",
          technologies: ["Next.js", "React", "Tailwind CSS"],
          description:
            "Server-side rendered storefront with responsive design and progressive web app capabilities.",
        },
        {
          name: "API Gateway",
          technologies: ["Kong", "Nginx", "Rate Limiter"],
          description:
            "Centralized entry point handling authentication, rate limiting, request routing, and load balancing.",
        },
        {
          name: "Service Layer",
          technologies: ["Node.js", "Python", "gRPC"],
          description:
            "Independent microservices: Product Service, Order Service, Recommendation Engine, Search Service.",
        },
        {
          name: "Data Layer",
          technologies: ["PostgreSQL", "Redis", "Pinecone"],
          description:
            "Relational DB for transactional data, Redis for caching/sessions, Pinecone for vector search.",
        },
      ],
    },

    projectFlow: [
      {
        id: "flow-1",
        title: "User Request",
        description: "Customer browses products or places an order",
        icon: "user",
      },
      {
        id: "flow-2",
        title: "API Gateway",
        description: "Routes request, validates JWT, applies rate limits",
        icon: "shield",
      },
      {
        id: "flow-3",
        title: "Auth Service",
        description: "Verifies identity via OAuth 2.0 / JWT",
        icon: "lock",
      },
      {
        id: "flow-4",
        title: "Business Logic",
        description: "Product catalog, cart, order processing, AI recommendations",
        icon: "cpu",
      },
      {
        id: "flow-5",
        title: "Data Store",
        description: "PostgreSQL writes, Redis cache reads, vector search queries",
        icon: "database",
      },
      {
        id: "flow-6",
        title: "Response",
        description: "JSON response with personalized content delivered to client",
        icon: "send",
      },
    ],

    techStack: [
      {
        category: "Frontend",
        items: [
          { name: "Next.js", icon: "layout", role: "SSR Framework" },
          { name: "React", icon: "code", role: "UI Library" },
          { name: "Tailwind CSS", icon: "palette", role: "Styling" },
          { name: "Zustand", icon: "box", role: "State Management" },
        ],
      },
      {
        category: "Backend",
        items: [
          { name: "Node.js", icon: "server", role: "Runtime" },
          { name: "Express", icon: "zap", role: "HTTP Framework" },
          { name: "Python", icon: "code-2", role: "ML Services" },
          { name: "FastAPI", icon: "rocket", role: "AI API Layer" },
        ],
      },
      {
        category: "Database",
        items: [
          { name: "PostgreSQL", icon: "database", role: "Primary Store" },
          { name: "Redis", icon: "hard-drive", role: "Cache Layer" },
          { name: "Pinecone", icon: "search", role: "Vector DB" },
        ],
      },
      {
        category: "DevOps",
        items: [
          { name: "Docker", icon: "container", role: "Containerization" },
          { name: "GitHub Actions", icon: "git-branch", role: "CI/CD" },
          { name: "AWS", icon: "cloud", role: "Cloud Provider" },
        ],
      },
    ],

    collaborationTools: [
      { name: "GitHub", purpose: "Version Control & Code Review", icon: "git-branch" },
      { name: "Slack", purpose: "Team Communication", icon: "message-circle" },
      { name: "Figma", purpose: "UI/UX Design & Prototyping", icon: "pen-tool" },
      { name: "Notion", purpose: "Documentation & Wiki", icon: "book-open" },
    ],

    purpose:
      "Build a scalable, AI-enhanced shopping experience that personalizes product discovery and streamlines the purchase journey.",
    businessPurpose:
      "Increase conversion rates by 35% through AI recommendations, reduce cart abandonment with real-time inventory visibility, and drive repeat purchases via personalized marketing.",
    targetAudience:
      "Online retailers with 10K-1M SKUs looking to modernize their digital storefront with AI capabilities.",

    dataDomains: [
      {
        domain: "Product Catalog",
        size: "~2M records",
        description: "Product listings with images, descriptions, variants, and pricing",
        color: "#458fff",
      },
      {
        domain: "User Activity",
        size: "~500K events/day",
        description: "Click streams, search queries, cart actions, and purchase history",
        color: "#10b981",
      },
      {
        domain: "Orders & Transactions",
        size: "~50K records/day",
        description: "Order details, payment records, shipping status, and refunds",
        color: "#f59e0b",
      },
    ],

    database: {
      dbType: "PostgreSQL 16",
      tables: [
        {
          name: "users",
          attributes: [
            { name: "id", type: "UUID", constraints: "PK, DEFAULT gen_random_uuid()" },
            { name: "email", type: "VARCHAR(255)", constraints: "UNIQUE, NOT NULL" },
            { name: "password_hash", type: "VARCHAR(255)", constraints: "NOT NULL" },
            { name: "full_name", type: "VARCHAR(100)", constraints: "NOT NULL" },
            { name: "role", type: "ENUM('customer','admin')", constraints: "DEFAULT 'customer'" },
            { name: "created_at", type: "TIMESTAMPTZ", constraints: "DEFAULT NOW()" },
          ],
        },
        {
          name: "products",
          attributes: [
            { name: "id", type: "UUID", constraints: "PK" },
            { name: "name", type: "VARCHAR(200)", constraints: "NOT NULL" },
            { name: "description", type: "TEXT", constraints: "" },
            { name: "price", type: "DECIMAL(10,2)", constraints: "NOT NULL" },
            { name: "category_id", type: "UUID", constraints: "FK → categories.id" },
            { name: "stock_count", type: "INTEGER", constraints: "DEFAULT 0" },
            { name: "embedding_vector", type: "VECTOR(1536)", constraints: "INDEX" },
          ],
        },
        {
          name: "orders",
          attributes: [
            { name: "id", type: "UUID", constraints: "PK" },
            { name: "user_id", type: "UUID", constraints: "FK → users.id" },
            { name: "status", type: "ENUM('pending','paid','shipped','delivered')", constraints: "NOT NULL" },
            { name: "total_amount", type: "DECIMAL(10,2)", constraints: "NOT NULL" },
            { name: "created_at", type: "TIMESTAMPTZ", constraints: "DEFAULT NOW()" },
          ],
        },
        {
          name: "order_items",
          attributes: [
            { name: "id", type: "UUID", constraints: "PK" },
            { name: "order_id", type: "UUID", constraints: "FK → orders.id" },
            { name: "product_id", type: "UUID", constraints: "FK → products.id" },
            { name: "quantity", type: "INTEGER", constraints: "NOT NULL" },
            { name: "unit_price", type: "DECIMAL(10,2)", constraints: "NOT NULL" },
          ],
        },
        {
          name: "recommendations",
          attributes: [
            { name: "id", type: "UUID", constraints: "PK" },
            { name: "user_id", type: "UUID", constraints: "FK → users.id" },
            { name: "product_id", type: "UUID", constraints: "FK → products.id" },
            { name: "score", type: "FLOAT", constraints: "NOT NULL" },
            { name: "algorithm", type: "VARCHAR(50)", constraints: "NOT NULL" },
            { name: "generated_at", type: "TIMESTAMPTZ", constraints: "DEFAULT NOW()" },
          ],
        },
      ],
    },
  },

  // ━━━ PROJECT 2: Healthcare Patient Management System ━━━━━━━━━━━━━━━━━━━━━
  {
    id: "proj-health",
    title: "Healthcare Patient Management System",
    overview:
      "A HIPAA-compliant patient management platform with appointment scheduling, electronic health records (EHR), telemedicine integration, and AI-powered diagnostics assistance.",
    difficulty: "advanced",
    estimatedTime: "12-14 weeks",

    architecture: {
      pattern: "Layered Monolith",
      description:
        "A modular monolith with clean layer separation, designed for strict compliance requirements and auditability. Event sourcing for all patient data mutations.",
      layers: [
        {
          name: "Presentation Layer",
          technologies: ["React", "Material UI", "React Query"],
          description:
            "Accessible web portal for doctors, nurses, and patients with role-based views.",
        },
        {
          name: "Application Layer",
          technologies: ["NestJS", "TypeScript", "Bull Queue"],
          description:
            "Business logic orchestration, appointment scheduling engine, and notification dispatcher.",
        },
        {
          name: "Domain Layer",
          technologies: ["DDD Patterns", "Event Sourcing", "CQRS"],
          description:
            "Core domain models: Patient, Appointment, Prescription, Diagnosis with aggregate roots.",
        },
        {
          name: "Infrastructure Layer",
          technologies: ["PostgreSQL", "MinIO", "HL7 FHIR"],
          description:
            "Persistence, file storage for medical images, and HL7 FHIR interoperability for EHR exchange.",
        },
      ],
    },

    projectFlow: [
      {
        id: "flow-1",
        title: "Patient Check-in",
        description: "Patient registers or checks in via portal/kiosk",
        icon: "user-plus",
      },
      {
        id: "flow-2",
        title: "Identity Verification",
        description: "MFA + insurance verification via third-party API",
        icon: "fingerprint",
      },
      {
        id: "flow-3",
        title: "Appointment Engine",
        description: "Smart scheduling with doctor availability & priority",
        icon: "calendar",
      },
      {
        id: "flow-4",
        title: "Clinical Workflow",
        description: "Vitals capture, diagnosis entry, prescription generation",
        icon: "stethoscope",
      },
      {
        id: "flow-5",
        title: "AI Diagnostics",
        description: "ML model suggests differential diagnoses from symptoms",
        icon: "brain",
      },
      {
        id: "flow-6",
        title: "EHR Update",
        description: "All records persisted with full audit trail",
        icon: "file-check",
      },
    ],

    techStack: [
      {
        category: "Frontend",
        items: [
          { name: "React", icon: "code", role: "UI Library" },
          { name: "Material UI", icon: "palette", role: "Component Library" },
          { name: "React Query", icon: "refresh-cw", role: "Data Fetching" },
        ],
      },
      {
        category: "Backend",
        items: [
          { name: "NestJS", icon: "server", role: "Application Framework" },
          { name: "TypeScript", icon: "file-code", role: "Type Safety" },
          { name: "Bull", icon: "clock", role: "Job Queue" },
          { name: "Socket.io", icon: "radio", role: "Real-time Updates" },
        ],
      },
      {
        category: "Database",
        items: [
          { name: "PostgreSQL", icon: "database", role: "Primary Store" },
          { name: "MinIO", icon: "hard-drive", role: "Object Storage" },
          { name: "Elasticsearch", icon: "search", role: "Patient Search" },
        ],
      },
      {
        category: "AI / ML",
        items: [
          { name: "TensorFlow", icon: "cpu", role: "Diagnostics Model" },
          { name: "Python", icon: "code-2", role: "ML Pipeline" },
        ],
      },
      {
        category: "DevOps",
        items: [
          { name: "Docker", icon: "container", role: "Containerization" },
          { name: "Terraform", icon: "layers", role: "IaC" },
          { name: "Azure", icon: "cloud", role: "HIPAA Cloud" },
        ],
      },
    ],

    collaborationTools: [
      { name: "Jira", purpose: "Sprint Planning & Issue Tracking", icon: "kanban" },
      { name: "Confluence", purpose: "Technical Documentation", icon: "book-open" },
      { name: "Microsoft Teams", purpose: "Communication & Video Calls", icon: "message-circle" },
      { name: "Miro", purpose: "Architecture Diagrams & Whiteboarding", icon: "pen-tool" },
    ],

    purpose:
      "Digitize and streamline the patient care workflow from check-in to diagnosis, reducing administrative burden and improving care quality.",
    businessPurpose:
      "Reduce average appointment wait time by 40%, eliminate paper-based records, ensure 100% HIPAA compliance, and enable data-driven clinical decisions with AI assistance.",
    targetAudience:
      "Mid-size hospitals and clinical networks (50-500 beds) transitioning from legacy systems to modern digital health infrastructure.",

    dataDomains: [
      {
        domain: "Patient Records",
        size: "~200K records",
        description: "Demographics, medical history, insurance details, and consent forms",
        color: "#6366f1",
      },
      {
        domain: "Appointments",
        size: "~5K bookings/day",
        description: "Scheduled visits, cancellations, rescheduling, and wait-list entries",
        color: "#ec4899",
      },
      {
        domain: "Medical Imaging",
        size: "~2TB storage",
        description: "X-rays, MRIs, CT scans stored as DICOM files in object storage",
        color: "#14b8a6",
      },
      {
        domain: "Audit Logs",
        size: "~1M events/day",
        description: "Every data access and mutation logged for HIPAA compliance",
        color: "#f97316",
      },
    ],

    database: {
      dbType: "PostgreSQL 16 + MinIO",
      tables: [
        {
          name: "patients",
          attributes: [
            { name: "id", type: "UUID", constraints: "PK" },
            { name: "mrn", type: "VARCHAR(20)", constraints: "UNIQUE, NOT NULL" },
            { name: "first_name", type: "VARCHAR(100)", constraints: "NOT NULL, ENCRYPTED" },
            { name: "last_name", type: "VARCHAR(100)", constraints: "NOT NULL, ENCRYPTED" },
            { name: "date_of_birth", type: "DATE", constraints: "NOT NULL" },
            { name: "insurance_id", type: "VARCHAR(50)", constraints: "FK → insurances.id" },
          ],
        },
        {
          name: "appointments",
          attributes: [
            { name: "id", type: "UUID", constraints: "PK" },
            { name: "patient_id", type: "UUID", constraints: "FK → patients.id" },
            { name: "doctor_id", type: "UUID", constraints: "FK → doctors.id" },
            { name: "scheduled_at", type: "TIMESTAMPTZ", constraints: "NOT NULL" },
            { name: "status", type: "ENUM('scheduled','completed','cancelled')", constraints: "NOT NULL" },
            { name: "notes", type: "TEXT", constraints: "ENCRYPTED" },
          ],
        },
        {
          name: "diagnoses",
          attributes: [
            { name: "id", type: "UUID", constraints: "PK" },
            { name: "appointment_id", type: "UUID", constraints: "FK → appointments.id" },
            { name: "icd_code", type: "VARCHAR(10)", constraints: "NOT NULL" },
            { name: "description", type: "TEXT", constraints: "NOT NULL" },
            { name: "ai_confidence", type: "FLOAT", constraints: "NULL" },
            { name: "diagnosed_by", type: "UUID", constraints: "FK → doctors.id" },
          ],
        },
        {
          name: "prescriptions",
          attributes: [
            { name: "id", type: "UUID", constraints: "PK" },
            { name: "diagnosis_id", type: "UUID", constraints: "FK → diagnoses.id" },
            { name: "medication", type: "VARCHAR(200)", constraints: "NOT NULL" },
            { name: "dosage", type: "VARCHAR(100)", constraints: "NOT NULL" },
            { name: "frequency", type: "VARCHAR(50)", constraints: "NOT NULL" },
            { name: "duration_days", type: "INTEGER", constraints: "NOT NULL" },
          ],
        },
        {
          name: "audit_logs",
          attributes: [
            { name: "id", type: "BIGSERIAL", constraints: "PK" },
            { name: "actor_id", type: "UUID", constraints: "NOT NULL" },
            { name: "action", type: "VARCHAR(50)", constraints: "NOT NULL" },
            { name: "resource_type", type: "VARCHAR(50)", constraints: "NOT NULL" },
            { name: "resource_id", type: "UUID", constraints: "NOT NULL" },
            { name: "timestamp", type: "TIMESTAMPTZ", constraints: "DEFAULT NOW(), INDEX" },
          ],
        },
      ],
    },
  },

  // ━━━ PROJECT 3: FinTech Real-Time Trading Dashboard ━━━━━━━━━━━━━━━━━━━━━━
  {
    id: "proj-fintech",
    title: "FinTech Real-Time Trading Dashboard",
    overview:
      "A high-frequency trading dashboard with real-time market data streams, portfolio analytics, risk assessment, and automated trade execution via WebSocket feeds.",
    difficulty: "advanced",
    estimatedTime: "10-12 weeks",

    architecture: {
      pattern: "Event-Driven / CQRS",
      description:
        "CQRS with event sourcing for trade execution, WebSocket streams for real-time market data, and a read-optimized analytics layer for dashboards.",
      layers: [
        {
          name: "Dashboard UI",
          technologies: ["React", "D3.js", "WebSocket Client"],
          description:
            "Real-time charts, portfolio views, and trade execution panel with sub-second updates.",
        },
        {
          name: "WebSocket Gateway",
          technologies: ["Go", "gorilla/websocket", "NATS"],
          description:
            "High-throughput WebSocket server multiplexing market data feeds to connected clients.",
        },
        {
          name: "Command Service",
          technologies: ["Go", "gRPC", "Kafka"],
          description:
            "Processes trade orders: validation, risk checks, execution, and event publishing.",
        },
        {
          name: "Query / Analytics",
          technologies: ["ClickHouse", "TimescaleDB", "Grafana"],
          description:
            "Read-optimized time-series store for historical analytics, PnL calculations, and reporting.",
        },
      ],
    },

    projectFlow: [
      {
        id: "flow-1",
        title: "Market Feed",
        description: "Real-time price ticks ingested from exchange APIs",
        icon: "activity",
      },
      {
        id: "flow-2",
        title: "Stream Processing",
        description: "NATS distributes to WebSocket gateway & analytics pipeline",
        icon: "git-merge",
      },
      {
        id: "flow-3",
        title: "Dashboard Render",
        description: "Live candlestick charts, order book, and position tracker",
        icon: "bar-chart-2",
      },
      {
        id: "flow-4",
        title: "Trade Command",
        description: "User submits buy/sell order via execution panel",
        icon: "arrow-right-left",
      },
      {
        id: "flow-5",
        title: "Risk Engine",
        description: "Validates margin, exposure limits, and compliance rules",
        icon: "shield-alert",
      },
      {
        id: "flow-6",
        title: "Execution & Settlement",
        description: "Order routed to exchange, fill confirmed, ledger updated",
        icon: "check-circle",
      },
    ],

    techStack: [
      {
        category: "Frontend",
        items: [
          { name: "React", icon: "code", role: "UI Framework" },
          { name: "D3.js", icon: "bar-chart", role: "Data Visualization" },
          { name: "TradingView", icon: "trending-up", role: "Chart Widget" },
        ],
      },
      {
        category: "Backend",
        items: [
          { name: "Go", icon: "zap", role: "High-Perf Services" },
          { name: "gRPC", icon: "radio", role: "Inter-Service Comm" },
          { name: "Kafka", icon: "layers", role: "Event Streaming" },
          { name: "NATS", icon: "send", role: "PubSub Messaging" },
        ],
      },
      {
        category: "Database",
        items: [
          { name: "TimescaleDB", icon: "database", role: "Time-Series Data" },
          { name: "ClickHouse", icon: "hard-drive", role: "OLAP Analytics" },
          { name: "Redis", icon: "zap", role: "Order Book Cache" },
        ],
      },
      {
        category: "DevOps",
        items: [
          { name: "Kubernetes", icon: "server", role: "Orchestration" },
          { name: "Prometheus", icon: "activity", role: "Monitoring" },
          { name: "Grafana", icon: "bar-chart-2", role: "Dashboards" },
          { name: "ArgoCD", icon: "git-branch", role: "GitOps CD" },
        ],
      },
    ],

    collaborationTools: [
      { name: "GitLab", purpose: "Source Control & CI/CD Pipelines", icon: "git-branch" },
      { name: "Linear", purpose: "Issue Tracking & Sprint Planning", icon: "kanban" },
      { name: "Discord", purpose: "Developer Communication", icon: "message-circle" },
      { name: "Excalidraw", purpose: "Architecture Sketches", icon: "pen-tool" },
    ],

    purpose:
      "Provide traders with a low-latency, feature-rich dashboard for monitoring markets, analyzing portfolios, and executing trades in real time.",
    businessPurpose:
      "Capture market share in the retail trading space by offering institutional-grade tooling at competitive pricing. Target 99.99% uptime SLA and sub-50ms trade execution latency.",
    targetAudience:
      "Active retail traders and small hedge funds requiring real-time analytics and fast execution without enterprise-level infrastructure costs.",

    dataDomains: [
      {
        domain: "Market Ticks",
        size: "~10M events/day",
        description: "Price updates, volume changes, and order book snapshots from exchanges",
        color: "#8b5cf6",
      },
      {
        domain: "Trade Orders",
        size: "~100K orders/day",
        description: "Buy/sell orders with timestamps, fills, partial fills, and cancellations",
        color: "#06b6d4",
      },
      {
        domain: "Portfolio Snapshots",
        size: "~50K snapshots/day",
        description: "Per-user portfolio value, PnL, margin utilization updated every 30 seconds",
        color: "#f43f5e",
      },
    ],

    database: {
      dbType: "TimescaleDB + ClickHouse + Redis",
      tables: [
        {
          name: "market_ticks",
          attributes: [
            { name: "time", type: "TIMESTAMPTZ", constraints: "NOT NULL, PARTITION KEY" },
            { name: "symbol", type: "VARCHAR(20)", constraints: "NOT NULL, INDEX" },
            { name: "price", type: "DECIMAL(18,8)", constraints: "NOT NULL" },
            { name: "volume", type: "BIGINT", constraints: "NOT NULL" },
            { name: "exchange", type: "VARCHAR(20)", constraints: "NOT NULL" },
          ],
        },
        {
          name: "trade_orders",
          attributes: [
            { name: "id", type: "UUID", constraints: "PK" },
            { name: "user_id", type: "UUID", constraints: "FK → users.id, INDEX" },
            { name: "symbol", type: "VARCHAR(20)", constraints: "NOT NULL" },
            { name: "side", type: "ENUM('buy','sell')", constraints: "NOT NULL" },
            { name: "quantity", type: "DECIMAL(18,8)", constraints: "NOT NULL" },
            { name: "price", type: "DECIMAL(18,8)", constraints: "NOT NULL" },
            { name: "status", type: "ENUM('pending','filled','partial','cancelled')", constraints: "NOT NULL" },
            { name: "created_at", type: "TIMESTAMPTZ", constraints: "DEFAULT NOW()" },
          ],
        },
        {
          name: "portfolios",
          attributes: [
            { name: "id", type: "UUID", constraints: "PK" },
            { name: "user_id", type: "UUID", constraints: "FK → users.id, UNIQUE" },
            { name: "total_value", type: "DECIMAL(18,2)", constraints: "NOT NULL" },
            { name: "available_margin", type: "DECIMAL(18,2)", constraints: "NOT NULL" },
            { name: "unrealized_pnl", type: "DECIMAL(18,2)", constraints: "NOT NULL" },
            { name: "updated_at", type: "TIMESTAMPTZ", constraints: "DEFAULT NOW()" },
          ],
        },
        {
          name: "positions",
          attributes: [
            { name: "id", type: "UUID", constraints: "PK" },
            { name: "portfolio_id", type: "UUID", constraints: "FK → portfolios.id" },
            { name: "symbol", type: "VARCHAR(20)", constraints: "NOT NULL" },
            { name: "quantity", type: "DECIMAL(18,8)", constraints: "NOT NULL" },
            { name: "avg_entry_price", type: "DECIMAL(18,8)", constraints: "NOT NULL" },
            { name: "current_price", type: "DECIMAL(18,8)", constraints: "NOT NULL" },
          ],
        },
        {
          name: "risk_alerts",
          attributes: [
            { name: "id", type: "UUID", constraints: "PK" },
            { name: "user_id", type: "UUID", constraints: "FK → users.id" },
            { name: "alert_type", type: "ENUM('margin_call','exposure_limit','stop_loss')", constraints: "NOT NULL" },
            { name: "message", type: "TEXT", constraints: "NOT NULL" },
            { name: "severity", type: "ENUM('low','medium','high','critical')", constraints: "NOT NULL" },
            { name: "triggered_at", type: "TIMESTAMPTZ", constraints: "DEFAULT NOW()" },
          ],
        },
      ],
    },
  },
];

// ─── Legacy re-export for backward compat (AIProjectsTable still uses old type) ─
export interface ProjectStep {
  id: string;
  title: string;
  difficulty: "easy" | "medium" | "hard";
  estimatedTime: string;
  tags: string[];
  challenge: string;
  why: string;
  howToSolve: string;
  tips: string[];
  warnings: string[];
  detailedSteps: Array<{ step: string; command: string }>;
  codeSnippets: Array<{ title: string; language: string; code: string }>;
  resources: Array<{ title: string; url: string }>;
  status: "not_started" | "in_progress" | "completed";
}

export interface ProjectSection {
  id: string;
  title: string;
  icon: string;
  description: string;
  steps: ProjectStep[];
}

export interface Project {
  id: string;
  title: string;
  overview: string;
  difficulty: string;
  estimatedTime: string;
  techStack: string[];
  sections: ProjectSection[];
}
