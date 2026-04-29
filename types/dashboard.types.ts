// ─── Activity feed ────────────────────────────────────────────────────────────

export type ActivityType =
  | "errand_posted"
  | "errand_running"
  | "order_placed"
  | "order_received";

export interface ActivityItem {
  type:      ActivityType;
  refId:     string;
  title:     string;
  status:    string;
  amountNGN: number;
  category?: string;
  updatedAt: Date;
}

// ─── Dashboard sections ───────────────────────────────────────────────────────

export interface ErrandSummary {
  total:              number;
  open?:              number; // poster only
  active:             number;
  awaitingConfirm:    number;
  completed?:         number; // runner only
  confirmed?:         number; // poster only
  cancelled?:         number; // poster only
  disputed:           number;
}

export interface ServiceListingSummary {
  total:  number;
  active: number;
  paused: number;
  draft:  number;
}

export interface OrderSummary {
  total:           number;
  active:          number;
  awaitingConfirm?: number;
  completed:       number;
  disputed:        number;
}

export interface WalletSummary {
  cbcBalance:    number;
  totalEarnedNGN: number;
}

// ─── Corporate-only extra ─────────────────────────────────────────────────────

export interface CompanySnapshot {
  name:               string;
  logo:               string | null;
  verificationStatus: string;
  verificationBadge:  boolean;
  totalSpendNGN:      number;   // sum of all completed order amounts as buyer
  totalOrdersCompleted: number;
  averageRating:      number;
}

// ─── Full dashboard shapes ────────────────────────────────────────────────────

interface DashboardBase {
  profile: {
    displayName:          string;
    firstName:            string;
    lastName:             string;
    avatar:               string | null;
    role:                 string;
    isStudent:            boolean;
    subscriptionTier:     string;
    identityStatus:       string;
    identityBadge:        boolean;
    averageRating:        number;
    totalReviews:         number;
    referralCode:         string;
    totalOrdersCompleted: number;
  };
  wallet:              WalletSummary;
  errands: {
    posted:  ErrandSummary;
    running: ErrandSummary;
  };
  services: {
    listings:      ServiceListingSummary;
    ordersBuying:  OrderSummary;
    ordersSelling: OrderSummary;
  };
  pendingErrands:      unknown[];
  pendingOrders:       unknown[];
  recentActivity:      ActivityItem[];
  unreadNotifications: number;
}

export interface IndividualDashboard extends DashboardBase {
  accountType: "individual";
}

export interface CorporateDashboard extends DashboardBase {
  accountType: "corporate";
  company:     CompanySnapshot;
}

export type DashboardResponse = IndividualDashboard | CorporateDashboard;
