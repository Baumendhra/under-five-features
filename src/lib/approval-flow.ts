/**
 * ApprovalFlow AI – Demo Data Store & Workflow Engine
 * All data is in-memory (localStorage-backed) for the demo sandbox.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type AppType = "EoA" | "NewInst" | "NewCourse" | "Closure";

export type AppStage =
  | "Submitted"
  | "ScrutinyPending"
  | "DeficiencyRaised"
  | "CompliancePending"
  | "EVCPending"
  | "EVCScheduled"
  | "EVCCompleted"
  | "RecommendationPending"
  | "FinalDecision"
  | "Approved"
  | "Rejected";

export type AppStatus = "Pending" | "Approved" | "Rejected" | "Returned";
export type DocType =
  | "Annexure1"
  | "Lease"
  | "NOC"
  | "FacultyList"
  | "FinancialStatement"
  | "BuildingPlan"
  | "Undertaking";
export type TaskType = "Deficiency" | "EVCVisit" | "Compliance" | "Review" | "Escalation";
export type TaskStatus = "Open" | "InProgress" | "Resolved" | "Overdue" | "Closed";
export type UserRole =
  "institution_admin" | "officer" | "evc_coordinator" | "compliance_officer" | "aicte_admin";

export interface Institution {
  id: string;
  name: string;
  aicteId: string;
  region: string;
  state: string;
  contactEmail: string;
}

export interface User {
  id: string;
  name: string;
  role: UserRole;
  email: string;
  region?: string;
  institutionId?: string;
}

export interface Application {
  id: string;
  institutionId: string;
  appType: AppType;
  submittedOn: string;
  currentStage: AppStage;
  status: AppStatus;
  assignedTo: string | null;
  region: string;
  remarks: string;
  slaDeadline: string;
  evcDate?: string;
  evcCommittee?: string[];
  deficiencyCount: number;
  updatedAt: string;
}

export interface Document {
  id: string;
  appId: string;
  type: DocType;
  fileName: string;
  uploadedOn: string;
  verified: boolean;
  ocrExtracted?: Record<string, string> | undefined;
  flags?: string[] | undefined;
}

export interface Task {
  id: string;
  appId: string;
  type: TaskType;
  description: string;
  dueDate: string;
  status: TaskStatus;
  assignedTo: string | null;
  createdAt: string;
  resolvedAt?: string | undefined;
  remarks?: string | undefined;
}

export interface Notification {
  id: string;
  userId: string;
  appId?: string | undefined;
  message: string;
  sentOn: string;
  readStatus: boolean;
  type: "info" | "warning" | "urgent";
}

export interface AuditLog {
  id: string;
  appId: string;
  userId: string;
  action: string;
  timestamp: string;
  remarks?: string | undefined;
  fromStage?: AppStage | undefined;
  toStage?: AppStage | undefined;
}

export interface WorkflowRule {
  appType: AppType;
  stages: AppStage[];
  evcRequired: boolean;
  sladays: number;
}

// ─── Workflow Config ──────────────────────────────────────────────────────────

export const DEFAULT_WORKFLOW_RULES: WorkflowRule[] = [
  {
    appType: "EoA",
    stages: [
      "Submitted",
      "ScrutinyPending",
      "DeficiencyRaised",
      "CompliancePending",
      "EVCPending",
      "EVCScheduled",
      "EVCCompleted",
      "RecommendationPending",
      "FinalDecision",
    ],
    evcRequired: true,
    sladays: 60,
  },
  {
    appType: "NewInst",
    stages: [
      "Submitted",
      "ScrutinyPending",
      "DeficiencyRaised",
      "CompliancePending",
      "EVCPending",
      "EVCScheduled",
      "EVCCompleted",
      "RecommendationPending",
      "FinalDecision",
    ],
    evcRequired: true,
    sladays: 90,
  },
  {
    appType: "NewCourse",
    stages: [
      "Submitted",
      "ScrutinyPending",
      "DeficiencyRaised",
      "CompliancePending",
      "RecommendationPending",
      "FinalDecision",
    ],
    evcRequired: false,
    sladays: 45,
  },
  {
    appType: "Closure",
    stages: ["Submitted", "ScrutinyPending", "RecommendationPending", "FinalDecision"],
    evcRequired: false,
    sladays: 30,
  },
];

export const STAGE_TRANSITIONS: Record<AppStage, AppStage[]> = {
  Submitted: ["ScrutinyPending"],
  ScrutinyPending: ["DeficiencyRaised", "EVCPending", "RecommendationPending"],
  DeficiencyRaised: ["CompliancePending"],
  CompliancePending: ["ScrutinyPending"],
  EVCPending: ["EVCScheduled"],
  EVCScheduled: ["EVCCompleted"],
  EVCCompleted: ["RecommendationPending"],
  RecommendationPending: ["FinalDecision"],
  FinalDecision: ["Approved", "Rejected"],
  Approved: [],
  Rejected: [],
};

export const STAGE_LABELS: Record<AppStage, string> = {
  Submitted: "Submitted",
  ScrutinyPending: "Scrutiny Pending",
  DeficiencyRaised: "Deficiency Raised",
  CompliancePending: "Compliance Pending",
  EVCPending: "EVC Pending",
  EVCScheduled: "EVC Scheduled",
  EVCCompleted: "EVC Completed",
  RecommendationPending: "Recommendation Pending",
  FinalDecision: "Final Decision",
  Approved: "Approved",
  Rejected: "Rejected",
};

export const STAGE_COLORS: Record<AppStage, string> = {
  Submitted: "bg-blue-100 text-blue-800",
  ScrutinyPending: "bg-amber-100 text-amber-800",
  DeficiencyRaised: "bg-red-100 text-red-800",
  CompliancePending: "bg-orange-100 text-orange-800",
  EVCPending: "bg-purple-100 text-purple-800",
  EVCScheduled: "bg-violet-100 text-violet-800",
  EVCCompleted: "bg-indigo-100 text-indigo-800",
  RecommendationPending: "bg-cyan-100 text-cyan-800",
  FinalDecision: "bg-teal-100 text-teal-800",
  Approved: "bg-green-100 text-green-800",
  Rejected: "bg-red-100 text-red-800",
};

export const APP_TYPE_LABELS: Record<AppType, string> = {
  EoA: "Extension of Approval",
  NewInst: "New Institution",
  NewCourse: "New Course",
  Closure: "Closure",
};

// ─── Seed Data ────────────────────────────────────────────────────────────────

function relDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

const SEED_INSTITUTIONS: Institution[] = [
  {
    id: "inst-1",
    name: "Sri Venkateswara College of Engineering",
    aicteId: "AICTE-TN-001",
    region: "South",
    state: "Tamil Nadu",
    contactEmail: "admin@svce.ac.in",
  },
  {
    id: "inst-2",
    name: "Delhi Institute of Technology",
    aicteId: "AICTE-DL-042",
    region: "North",
    state: "Delhi",
    contactEmail: "info@dit.ac.in",
  },
  {
    id: "inst-3",
    name: "Pune Institute of Computer Technology",
    aicteId: "AICTE-MH-017",
    region: "West",
    state: "Maharashtra",
    contactEmail: "contact@pict.edu",
  },
  {
    id: "inst-4",
    name: "BITS Pilani Extension Centre",
    aicteId: "AICTE-RJ-009",
    region: "North",
    state: "Rajasthan",
    contactEmail: "admin@bits.ac.in",
  },
  {
    id: "inst-5",
    name: "NIT Warangal",
    aicteId: "AICTE-TG-003",
    region: "South",
    state: "Telangana",
    contactEmail: "admin@nitw.ac.in",
  },
  {
    id: "inst-6",
    name: "IIT Kharagpur Extension",
    aicteId: "AICTE-WB-011",
    region: "East",
    state: "West Bengal",
    contactEmail: "admin@iitkgp.ac.in",
  },
];

const SEED_USERS: User[] = [
  {
    id: "u-institution-1",
    name: "Dr. Rajesh Kumar",
    role: "institution_admin",
    email: "admin@svce.ac.in",
    institutionId: "inst-1",
  },
  {
    id: "u-institution-2",
    name: "Prof. Meena Iyer",
    role: "institution_admin",
    email: "info@dit.ac.in",
    institutionId: "inst-2",
  },
  {
    id: "u-officer-1",
    name: "Priya Nair",
    role: "officer",
    email: "priya.nair@aicte.gov.in",
    region: "South",
  },
  {
    id: "u-officer-2",
    name: "Vikram Mehta",
    role: "officer",
    email: "vikram.mehta@aicte.gov.in",
    region: "North",
  },
  {
    id: "u-evc-1",
    name: "Dr. Anand Srivastava",
    role: "evc_coordinator",
    email: "anand.s@aicte.gov.in",
    region: "South",
  },
  {
    id: "u-compliance-1",
    name: "Sunita Rao",
    role: "compliance_officer",
    email: "sunita.rao@aicte.gov.in",
  },
  {
    id: "u-admin-1",
    name: "Aditya Singh",
    role: "aicte_admin",
    email: "aditya.singh@aicte.gov.in",
  },
];

const SEED_APPLICATIONS: Application[] = [
  {
    id: "APP-2025-001",
    institutionId: "inst-1",
    appType: "EoA",
    submittedOn: relDate(-30),
    currentStage: "ScrutinyPending",
    status: "Pending",
    assignedTo: "u-officer-1",
    region: "South",
    remarks: "EoA for 2025-26 academic year",
    slaDeadline: relDate(30),
    deficiencyCount: 0,
    updatedAt: relDate(-2),
  },
  {
    id: "APP-2025-002",
    institutionId: "inst-2",
    appType: "NewCourse",
    submittedOn: relDate(-15),
    currentStage: "DeficiencyRaised",
    status: "Returned",
    assignedTo: "u-officer-2",
    region: "North",
    remarks: "Missing faculty qualification documents",
    slaDeadline: relDate(5),
    deficiencyCount: 2,
    updatedAt: relDate(-1),
  },
  {
    id: "APP-2025-003",
    institutionId: "inst-3",
    appType: "EoA",
    submittedOn: relDate(-45),
    currentStage: "EVCScheduled",
    status: "Pending",
    assignedTo: "u-evc-1",
    region: "West",
    remarks: "EVC visit scheduled",
    slaDeadline: relDate(15),
    deficiencyCount: 1,
    updatedAt: relDate(-3),
    evcDate: relDate(7),
    evcCommittee: ["Dr. Anand Srivastava", "Prof. K. Ramesh"],
  },
  {
    id: "APP-2025-004",
    institutionId: "inst-4",
    appType: "NewInst",
    submittedOn: relDate(-60),
    currentStage: "RecommendationPending",
    status: "Pending",
    assignedTo: "u-admin-1",
    region: "North",
    remarks: "All stages cleared, pending recommendation",
    slaDeadline: relDate(10),
    deficiencyCount: 0,
    updatedAt: relDate(-1),
  },
  {
    id: "APP-2025-005",
    institutionId: "inst-5",
    appType: "Closure",
    submittedOn: relDate(-10),
    currentStage: "ScrutinyPending",
    status: "Pending",
    assignedTo: "u-officer-1",
    region: "South",
    remarks: "Voluntary closure application",
    slaDeadline: relDate(20),
    deficiencyCount: 0,
    updatedAt: relDate(-1),
  },
  {
    id: "APP-2025-006",
    institutionId: "inst-1",
    appType: "NewCourse",
    submittedOn: relDate(-90),
    currentStage: "Approved",
    status: "Approved",
    assignedTo: "u-admin-1",
    region: "South",
    remarks: "Approved after successful scrutiny",
    slaDeadline: relDate(-30),
    deficiencyCount: 0,
    updatedAt: relDate(-20),
  },
  {
    id: "APP-2025-007",
    institutionId: "inst-6",
    appType: "EoA",
    submittedOn: relDate(-3),
    currentStage: "Submitted",
    status: "Pending",
    assignedTo: null,
    region: "East",
    remarks: "",
    slaDeadline: relDate(57),
    deficiencyCount: 0,
    updatedAt: relDate(-3),
  },
  {
    id: "APP-2025-008",
    institutionId: "inst-2",
    appType: "EoA",
    submittedOn: relDate(-70),
    currentStage: "Rejected",
    status: "Rejected",
    assignedTo: "u-admin-1",
    region: "North",
    remarks: "Infrastructure requirements not met",
    slaDeadline: relDate(-10),
    deficiencyCount: 3,
    updatedAt: relDate(-10),
  },
];

const SEED_DOCUMENTS: Document[] = [
  {
    id: "doc-1",
    appId: "APP-2025-001",
    type: "Annexure1",
    fileName: "annexure1_svce.pdf",
    uploadedOn: relDate(-30),
    verified: true,
    ocrExtracted: { facultyCount: "45", intake: "180" },
  },
  {
    id: "doc-2",
    appId: "APP-2025-001",
    type: "Lease",
    fileName: "lease_agreement.pdf",
    uploadedOn: relDate(-30),
    verified: true,
  },
  {
    id: "doc-3",
    appId: "APP-2025-001",
    type: "NOC",
    fileName: "noc_state.pdf",
    uploadedOn: relDate(-28),
    verified: false,
    flags: ["Signature missing on page 3"],
  },
  {
    id: "doc-4",
    appId: "APP-2025-002",
    type: "FacultyList",
    fileName: "faculty_list.pdf",
    uploadedOn: relDate(-15),
    verified: false,
    ocrExtracted: { facultyCount: "22" },
    flags: ["Faculty count mismatch: form says 30, OCR extracted 22"],
  },
  {
    id: "doc-5",
    appId: "APP-2025-003",
    type: "Annexure1",
    fileName: "annexure1.pdf",
    uploadedOn: relDate(-45),
    verified: true,
  },
  {
    id: "doc-6",
    appId: "APP-2025-003",
    type: "BuildingPlan",
    fileName: "building_plan.pdf",
    uploadedOn: relDate(-44),
    verified: true,
  },
  {
    id: "doc-7",
    appId: "APP-2025-004",
    type: "Annexure1",
    fileName: "annexure1.pdf",
    uploadedOn: relDate(-60),
    verified: true,
  },
  {
    id: "doc-8",
    appId: "APP-2025-004",
    type: "FinancialStatement",
    fileName: "financials.pdf",
    uploadedOn: relDate(-58),
    verified: true,
  },
  {
    id: "doc-9",
    appId: "APP-2025-004",
    type: "Undertaking",
    fileName: "undertaking_signed.pdf",
    uploadedOn: relDate(-55),
    verified: true,
  },
];

const SEED_TASKS: Task[] = [
  {
    id: "task-1",
    appId: "APP-2025-001",
    type: "Review",
    description: "Complete initial scrutiny of EoA documents",
    dueDate: relDate(7),
    status: "Open",
    assignedTo: "u-officer-1",
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: "task-2",
    appId: "APP-2025-002",
    type: "Deficiency",
    description: "Faculty qualification certificates missing; 3 faculty don't meet UGC norms",
    dueDate: relDate(5),
    status: "Open",
    assignedTo: "u-officer-2",
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
  },
  {
    id: "task-3",
    appId: "APP-2025-002",
    type: "Deficiency",
    description: "Lease deed stamp duty not paid – attach proof of payment",
    dueDate: relDate(5),
    status: "InProgress",
    assignedTo: "u-officer-2",
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
  },
  {
    id: "task-4",
    appId: "APP-2025-003",
    type: "EVCVisit",
    description: "Schedule and conduct EVC on-site inspection for PICT",
    dueDate: relDate(7),
    status: "InProgress",
    assignedTo: "u-evc-1",
    createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
  },
  {
    id: "task-5",
    appId: "APP-2025-004",
    type: "Review",
    description: "Prepare final recommendation report for committee",
    dueDate: relDate(10),
    status: "Open",
    assignedTo: "u-admin-1",
    createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
  },
  {
    id: "task-6",
    appId: "APP-2025-005",
    type: "Review",
    description: "Scrutiny: verify student disposition plan for closure",
    dueDate: relDate(15),
    status: "Open",
    assignedTo: "u-officer-1",
    createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
  },
  {
    id: "task-7",
    appId: "APP-2025-001",
    type: "Compliance",
    description: "Lease agreement expires in 30 days – obtain renewal from institution",
    dueDate: relDate(30),
    status: "Open",
    assignedTo: "u-compliance-1",
    createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    remarks: "Lease valid until end of month",
  },
];

const SEED_NOTIFICATIONS: Notification[] = [
  {
    id: "n-1",
    userId: "u-officer-1",
    appId: "APP-2025-001",
    message: "APP-2025-001 assigned to you for scrutiny. SLA: 30 days.",
    sentOn: relDate(-2),
    readStatus: false,
    type: "info",
  },
  {
    id: "n-2",
    userId: "u-officer-2",
    appId: "APP-2025-002",
    message: "Deficiency response overdue by 2 days on APP-2025-002.",
    sentOn: relDate(-1),
    readStatus: false,
    type: "urgent",
  },
  {
    id: "n-3",
    userId: "u-evc-1",
    appId: "APP-2025-003",
    message: `EVC visit for APP-2025-003 confirmed for ${relDate(7)}.`,
    sentOn: relDate(-3),
    readStatus: true,
    type: "info",
  },
  {
    id: "n-4",
    userId: "u-institution-1",
    appId: "APP-2025-001",
    message: "Your application APP-2025-001 is under scrutiny review.",
    sentOn: relDate(-2),
    readStatus: false,
    type: "info",
  },
  {
    id: "n-5",
    userId: "u-institution-2",
    appId: "APP-2025-002",
    message: "Deficiency raised on APP-2025-002. Upload missing docs within 7 days.",
    sentOn: relDate(-5),
    readStatus: true,
    type: "warning",
  },
  {
    id: "n-6",
    userId: "u-compliance-1",
    appId: "APP-2025-001",
    message: "Lease agreement for APP-2025-001 expires in 30 days. Action required.",
    sentOn: relDate(-1),
    readStatus: false,
    type: "warning",
  },
  {
    id: "n-7",
    userId: "u-admin-1",
    message: "3 applications are beyond SLA threshold. Escalation required.",
    sentOn: relDate(-1),
    readStatus: false,
    type: "urgent",
  },
];

const SEED_AUDIT_LOGS: AuditLog[] = [
  {
    id: "al-1",
    appId: "APP-2025-001",
    userId: "u-institution-1",
    action: "Application Submitted",
    timestamp: new Date(Date.now() - 30 * 86400000).toISOString(),
    toStage: "Submitted",
  },
  {
    id: "al-2",
    appId: "APP-2025-001",
    userId: "u-admin-1",
    action: "Moved to Scrutiny",
    timestamp: new Date(Date.now() - 29 * 86400000).toISOString(),
    fromStage: "Submitted",
    toStage: "ScrutinyPending",
    remarks: "Auto-assigned to Priya Nair",
  },
  {
    id: "al-3",
    appId: "APP-2025-002",
    userId: "u-institution-2",
    action: "Application Submitted",
    timestamp: new Date(Date.now() - 15 * 86400000).toISOString(),
    toStage: "Submitted",
  },
  {
    id: "al-4",
    appId: "APP-2025-002",
    userId: "u-officer-2",
    action: "Deficiency Raised",
    timestamp: new Date(Date.now() - 10 * 86400000).toISOString(),
    fromStage: "ScrutinyPending",
    toStage: "DeficiencyRaised",
    remarks: "Faculty docs missing",
  },
  {
    id: "al-5",
    appId: "APP-2025-003",
    userId: "u-evc-1",
    action: "EVC Scheduled",
    timestamp: new Date(Date.now() - 5 * 86400000).toISOString(),
    fromStage: "EVCPending",
    toStage: "EVCScheduled",
    remarks: `Visit on ${relDate(7)}`,
  },
  {
    id: "al-6",
    appId: "APP-2025-006",
    userId: "u-admin-1",
    action: "Application Approved",
    timestamp: new Date(Date.now() - 20 * 86400000).toISOString(),
    fromStage: "FinalDecision",
    toStage: "Approved",
    remarks: "All requirements met",
  },
  {
    id: "al-7",
    appId: "APP-2025-008",
    userId: "u-admin-1",
    action: "Application Rejected",
    timestamp: new Date(Date.now() - 10 * 86400000).toISOString(),
    fromStage: "FinalDecision",
    toStage: "Rejected",
    remarks: "Infrastructure requirements not met",
  },
];

// ─── Storage helpers ──────────────────────────────────────────────────────────

function load<T>(key: string, seed: T): T {
  if (typeof window === "undefined") return seed;
  try {
    const s = localStorage.getItem(key);
    if (s) return JSON.parse(s) as T;
  } catch {
    /* ignore */
  }
  return seed;
}
function save<T>(key: string, data: T): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

// ─── Store ────────────────────────────────────────────────────────────────────

class ApprovalFlowStore {
  institutions: Institution[] = load("af_institutions", SEED_INSTITUTIONS);
  users: User[] = load("af_users", SEED_USERS);
  applications: Application[] = load("af_applications", SEED_APPLICATIONS);
  documents: Document[] = load("af_documents", SEED_DOCUMENTS);
  tasks: Task[] = load("af_tasks", SEED_TASKS);
  notifications: Notification[] = load("af_notifications", SEED_NOTIFICATIONS);
  auditLogs: AuditLog[] = load("af_audit", SEED_AUDIT_LOGS);
  workflowRules: WorkflowRule[] = load("af_rules", DEFAULT_WORKFLOW_RULES);

  private persist() {
    save("af_institutions", this.institutions);
    save("af_applications", this.applications);
    save("af_documents", this.documents);
    save("af_tasks", this.tasks);
    save("af_notifications", this.notifications);
    save("af_audit", this.auditLogs);
    save("af_rules", this.workflowRules);
  }

  // ── Queries ──────────────────────────────────────────────────────────────

  getApplication(id: string) {
    return this.applications.find((a) => a.id === id);
  }
  getInstitution(id: string) {
    return this.institutions.find((i) => i.id === id);
  }
  getUser(id: string) {
    return this.users.find((u) => u.id === id);
  }

  getApplicationsForRole(role: UserRole, userId: string): Application[] {
    const user = this.getUser(userId);
    if (!user) return [];
    if (role === "institution_admin")
      return this.applications.filter((a) => a.institutionId === user.institutionId);
    if (role === "officer" && user.region)
      return this.applications.filter((a) => a.region === user.region);
    if (role === "evc_coordinator")
      return this.applications.filter((a) =>
        ["EVCPending", "EVCScheduled", "EVCCompleted"].includes(a.currentStage),
      );
    if (role === "compliance_officer")
      return this.applications.filter((a) =>
        ["CompliancePending", "ScrutinyPending"].includes(a.currentStage),
      );
    return this.applications; // aicte_admin sees all
  }

  getDocumentsForApp(appId: string) {
    return this.documents.filter((d) => d.appId === appId);
  }
  getTasksForApp(appId: string) {
    return this.tasks.filter((t) => t.appId === appId);
  }
  getNotificationsForUser(userId: string) {
    return this.notifications.filter((n) => n.userId === userId);
  }
  getAuditLogsForApp(appId: string) {
    return this.auditLogs
      .filter((l) => l.appId === appId)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }
  getWorkflowRule(appType: AppType) {
    return this.workflowRules.find((r) => r.appType === appType);
  }

  searchApplications(
    query: string,
    filters: {
      stage?: AppStage | undefined;
      region?: string | undefined;
      status?: AppStatus | undefined;
      appType?: AppType | undefined;
    },
  ) {
    let results = [...this.applications];
    if (query) {
      const q = query.toLowerCase();
      results = results.filter((a) => {
        const inst = this.getInstitution(a.institutionId);
        return (
          a.id.toLowerCase().includes(q) ||
          inst?.name.toLowerCase().includes(q) ||
          inst?.aicteId.toLowerCase().includes(q)
        );
      });
    }
    if (filters.stage) results = results.filter((a) => a.currentStage === filters.stage);
    if (filters.region) results = results.filter((a) => a.region === filters.region);
    if (filters.status) results = results.filter((a) => a.status === filters.status);
    if (filters.appType) results = results.filter((a) => a.appType === filters.appType);
    return results;
  }

  // ── Mutations ─────────────────────────────────────────────────────────────

  submitApplication(data: {
    institutionId: string;
    appType: AppType;
    remarks: string;
    region: string;
    submittedByUserId: string;
  }): Application {
    const rule = this.getWorkflowRule(data.appType);
    const app: Application = {
      id: `APP-${new Date().getFullYear()}-${String(this.applications.length + 1).padStart(3, "0")}`,
      institutionId: data.institutionId,
      appType: data.appType,
      submittedOn: new Date().toISOString().slice(0, 10),
      currentStage: "Submitted",
      status: "Pending",
      assignedTo: null,
      region: data.region,
      remarks: data.remarks,
      slaDeadline: relDate(rule?.sladays ?? 60),
      deficiencyCount: 0,
      updatedAt: new Date().toISOString().slice(0, 10),
    };
    this.applications.push(app);
    this._auditLog(app.id, data.submittedByUserId, "Application Submitted", undefined, "Submitted");
    this._notify(
      data.submittedByUserId,
      `Your application ${app.id} has been submitted successfully.`,
      app.id,
      "info",
    );
    this.persist();
    return app;
  }

  transitionStage(appId: string, toStage: AppStage, userId: string, remarks?: string): Application {
    const app = this.applications.find((a) => a.id === appId);
    if (!app) throw new Error("Application not found");
    const allowed = STAGE_TRANSITIONS[app.currentStage];
    if (!allowed.includes(toStage))
      throw new Error(`Cannot transition from ${app.currentStage} to ${toStage}`);
    const fromStage = app.currentStage;
    app.currentStage = toStage;
    app.updatedAt = new Date().toISOString().slice(0, 10);
    app.status =
      toStage === "Approved"
        ? "Approved"
        : toStage === "Rejected"
          ? "Rejected"
          : toStage === "DeficiencyRaised"
            ? "Returned"
            : "Pending";
    if (toStage === "DeficiencyRaised") app.deficiencyCount++;
    if (remarks) app.remarks = remarks;
    this._auditLog(
      appId,
      userId,
      `${STAGE_LABELS[fromStage]} → ${STAGE_LABELS[toStage]}`,
      fromStage,
      toStage,
      remarks,
    );
    this.persist();
    return app;
  }

  raiseDeficiency(
    appId: string,
    description: string,
    dueDate: string,
    assignedTo: string,
    raisedBy: string,
  ): Task {
    const app = this.applications.find((a) => a.id === appId);
    if (app) {
      app.currentStage = "DeficiencyRaised";
      app.status = "Returned";
      app.deficiencyCount++;
      app.updatedAt = new Date().toISOString().slice(0, 10);
    }
    const task: Task = {
      id: `task-${Date.now()}`,
      appId,
      type: "Deficiency",
      description,
      dueDate,
      status: "Open",
      assignedTo,
      createdAt: new Date().toISOString(),
    };
    this.tasks.push(task);
    this._auditLog(
      appId,
      raisedBy,
      "Deficiency Raised",
      "ScrutinyPending",
      "DeficiencyRaised",
      description,
    );
    this._notify(assignedTo, `Deficiency raised on ${appId}: ${description}`, appId, "warning");
    this.persist();
    return task;
  }

  resolveTask(taskId: string, userId: string, remarks?: string): Task {
    const task = this.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error("Task not found");
    task.status = "Resolved";
    task.resolvedAt = new Date().toISOString();
    task.remarks = remarks;
    this._auditLog(
      task.appId,
      userId,
      `Task resolved: ${task.description.slice(0, 60)}`,
      undefined,
      undefined,
      remarks,
    );
    this.persist();
    return task;
  }

  scheduleEVC(appId: string, evcDate: string, committee: string[], userId: string): Application {
    const app = this.applications.find((a) => a.id === appId);
    if (!app) throw new Error("Application not found");
    app.evcDate = evcDate;
    app.evcCommittee = committee;
    app.currentStage = "EVCScheduled";
    app.updatedAt = new Date().toISOString().slice(0, 10);
    this._auditLog(appId, userId, `EVC Scheduled for ${evcDate}`, "EVCPending", "EVCScheduled");
    this._notify(userId, `EVC visit scheduled for ${appId} on ${evcDate}`, appId, "info");
    this.persist();
    return app;
  }

  assignApplication(appId: string, toUserId: string, byUserId: string): Application {
    const app = this.applications.find((a) => a.id === appId);
    if (!app) throw new Error("Application not found");
    app.assignedTo = toUserId;
    app.updatedAt = new Date().toISOString().slice(0, 10);
    const user = this.getUser(toUserId);
    this._auditLog(appId, byUserId, `Assigned to ${user?.name ?? toUserId}`);
    this._notify(toUserId, `Application ${appId} has been assigned to you.`, appId, "info");
    this.persist();
    return app;
  }

  uploadDocument(
    appId: string,
    docType: DocType,
    fileName: string,
    uploadedByUserId: string,
    ocrData?: Record<string, string>,
    flags?: string[],
  ): Document {
    const doc: Document = {
      id: `doc-${Date.now()}`,
      appId,
      type: docType,
      fileName,
      uploadedOn: new Date().toISOString().slice(0, 10),
      verified: false,
      ocrExtracted: ocrData,
      flags,
    };
    this.documents.push(doc);
    this._auditLog(appId, uploadedByUserId, `Document uploaded: ${docType} (${fileName})`);
    this.persist();
    return doc;
  }

  verifyDocument(docId: string, userId: string): Document {
    const doc = this.documents.find((d) => d.id === docId);
    if (!doc) throw new Error("Document not found");
    doc.verified = true;
    doc.flags = [];
    this._auditLog(doc.appId, userId, `Document verified: ${doc.type}`);
    this.persist();
    return doc;
  }

  markNotificationRead(notifId: string) {
    const n = this.notifications.find((n) => n.id === notifId);
    if (n) n.readStatus = true;
    this.persist();
  }

  markAllNotificationsRead(userId: string) {
    this.notifications.filter((n) => n.userId === userId).forEach((n) => (n.readStatus = true));
    this.persist();
  }

  updateWorkflowRule(appType: AppType, updates: Partial<WorkflowRule>) {
    const rule = this.workflowRules.find((r) => r.appType === appType);
    if (!rule) throw new Error("Rule not found");
    Object.assign(rule, updates);
    this.persist();
    return rule;
  }

  resetToSeed() {
    this.institutions = [...SEED_INSTITUTIONS];
    this.users = [...SEED_USERS];
    this.applications = JSON.parse(JSON.stringify(SEED_APPLICATIONS));
    this.documents = JSON.parse(JSON.stringify(SEED_DOCUMENTS));
    this.tasks = JSON.parse(JSON.stringify(SEED_TASKS));
    this.notifications = JSON.parse(JSON.stringify(SEED_NOTIFICATIONS));
    this.auditLogs = JSON.parse(JSON.stringify(SEED_AUDIT_LOGS));
    this.workflowRules = JSON.parse(JSON.stringify(DEFAULT_WORKFLOW_RULES));
    this.persist();
  }

  // ── Analytics ─────────────────────────────────────────────────────────────

  getAnalytics() {
    const apps = this.applications;
    const total = apps.length;
    const approved = apps.filter((a) => a.status === "Approved").length;
    const rejected = apps.filter((a) => a.status === "Rejected").length;
    const pending = apps.filter((a) => a.status === "Pending").length;
    const returned = apps.filter((a) => a.status === "Returned").length;
    const byType: Record<string, number> = {};
    const byStage: Record<string, number> = {};
    const byRegion: Record<string, number> = {};
    for (const a of apps) {
      byType[a.appType] = (byType[a.appType] ?? 0) + 1;
      byStage[a.currentStage] = (byStage[a.currentStage] ?? 0) + 1;
      byRegion[a.region] = (byRegion[a.region] ?? 0) + 1;
    }
    const slaBreached = apps.filter(
      (a) =>
        a.status !== "Approved" && a.status !== "Rejected" && new Date(a.slaDeadline) < new Date(),
    ).length;
    const closedApps = apps.filter((a) => a.status === "Approved" || a.status === "Rejected");
    const avgProcessingDays =
      closedApps.length > 0
        ? Math.round(
            closedApps.reduce(
              (acc, a) =>
                acc +
                Math.max(
                  0,
                  Math.round(
                    (new Date(a.updatedAt).getTime() - new Date(a.submittedOn).getTime()) /
                      86400000,
                  ),
                ),
              0,
            ) / closedApps.length,
          )
        : 0;
    return {
      total,
      approved,
      rejected,
      pending,
      returned,
      byType,
      byStage,
      byRegion,
      slaBreached,
      avgProcessingDays,
    };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _auditLog(
    appId: string,
    userId: string,
    action: string,
    fromStage?: AppStage,
    toStage?: AppStage,
    remarks?: string,
  ) {
    this.auditLogs.unshift({
      id: `al-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      appId,
      userId,
      action,
      timestamp: new Date().toISOString(),
      fromStage,
      toStage,
      remarks,
    });
  }

  private _notify(
    userId: string,
    message: string,
    appId?: string,
    type: "info" | "warning" | "urgent" = "info",
  ) {
    this.notifications.unshift({
      id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      userId,
      message,
      appId,
      sentOn: new Date().toISOString(),
      readStatus: false,
      type,
    });
  }
}

export const afStore = new ApprovalFlowStore();

// ─── Role-mapping helpers ─────────────────────────────────────────────────────

export function getDemoUserId(role: UserRole): string {
  const map: Record<UserRole, string> = {
    institution_admin: "u-institution-1",
    officer: "u-officer-1",
    evc_coordinator: "u-evc-1",
    compliance_officer: "u-compliance-1",
    aicte_admin: "u-admin-1",
  };
  return map[role];
}

export function isOverdue(app: Application): boolean {
  if (app.status === "Approved" || app.status === "Rejected") return false;
  return new Date(app.slaDeadline) < new Date();
}

export function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}
