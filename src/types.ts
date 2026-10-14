export type Member = {
  id: string;
  name: string;
  /** Tên hiển thị trên Zalo, để khớp vote */
  zaloNames?: string[];
  zaloAvatar?: string;
};

export type ZaloContact = {
  id: string;
  name: string;
  avatar: string;
  memberId?: string;
};

export type CourtTime = {
  id: string;
  startTime: string;
  endTime: string;
};

export type CourtSlot = {
  id: string;
  name: string;
  times: CourtTime[];
  /** 0 / thiếu = dùng giá chi nhánh */
  pricePerHour?: number;
};

export type Court = {
  id: string;
  name: string;
  pricePerHour: number;
  /** @deprecated dùng slots; giữ để đọc dữ liệu cũ */
  courtCount?: number;
  slots: CourtSlot[];
};

export type SessionCourt = {
  id: string;
  courtId: string;
  slotId: string;
  name: string;
  slotName: string;
  pricePerHour: number;
  courtNumber: number;
  hours: number;
  startTime: string;
  endTime: string;
};

export type ExtraShuttle = {
  id: string;
  name: string;
  price: number;
  count: number;
};

export type Session = {
  date: string;
  courtFee: number;
  courts: SessionCourt[];
  shuttleCount: number;
  extraShuttles: ExtraShuttle[];
  attendeeIds: string[];
  attendeeCount: number;
  /** memberId → số giờ đánh. Thiếu = đủ giờ buổi */
  attendeeHours?: Record<string, number>;
  paidIds: string[];
  saved: boolean;
};

export type MonthData = {
  id: string;
  shuttleName: string;
  shuttlePrice: number;
  /** 0 = T2 ... 6 = CN. Áp dụng cho cả tháng. */
  weekdays: number[];
  skippedDates: string[];
  extraDates: string[];
  playingDates: string[];
  sessions: Record<string, Session>;
};

export type AppData = {
  version: 1;
  members: Member[];
  zaloContacts: ZaloContact[];
  courts: Court[];
  months: Record<string, MonthData>;
};

export const EMPTY_DATA: AppData = {
  version: 1,
  members: [],
  zaloContacts: [],
  courts: [],
  months: {},
};

export type TabName = 'month' | 'summary' | 'members' | 'courts' | 'zalo';
