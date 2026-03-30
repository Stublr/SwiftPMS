export interface PaginatedResponse<T> {
  data: T[];
  cursor: string | null;
  hasMore: boolean;
  total?: number;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface PaginationQuery {
  cursor?: string;
  limit?: number;
}
