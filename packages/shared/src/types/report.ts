export interface OccupancyReportQuery {
  propertyId: string;
  startDate: string;
  endDate: string;
  groupBy?: "day" | "week" | "month";
}

export interface OccupancyReportRow {
  period: string;
  totalRooms: number;
  occupiedRooms: number;
  occupancyRate: number; // percentage 0-100
}

export interface RevenueReportQuery {
  propertyId: string;
  startDate: string;
  endDate: string;
  groupBy?: "day" | "week" | "month";
}

export interface RevenueReportRow {
  period: string;
  roomRevenue: number; // cents
  serviceRevenue: number; // cents
  totalRevenue: number; // cents
}
