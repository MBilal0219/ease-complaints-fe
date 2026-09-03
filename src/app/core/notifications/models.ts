export interface NotificationDto {
  id: string;
  title: string;
  message: string;
  ticketId: string | null;
  isRead: boolean;
  createdAtUtc: string;
}

export interface PagedResult<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
}
