// 호텔 예약 시스템 타입 정의

export interface Hotel {
  id: number
  name: string
  nameEn?: string
  description?: string
  address: string
  phone?: string
  email?: string
  checkInTime: string
  checkOutTime: string
  images: string[]
  amenities: string[]
  locationLat?: number
  locationLng?: number
  status: number
  createdAt: string
  updatedAt: string
  roomTypes: RoomType[]
}

export interface RoomType {
  id: number
  hotelId: number
  name: string
  nameEn?: string
  description?: string
  maxOccupancy: number
  bedType?: string
  roomSize?: number
  amenities: string[]
  images: string[]
  basePrice: number
  status: number
  createdAt: string
  updatedAt: string
  rooms?: Room[]
  roomPrices?: RoomPrice[]
  availableRooms?: number
}

export interface Room {
  id: number
  hotelId: number
  roomTypeId: number
  roomNumber: string
  floor?: number
  status: number
  createdAt: string
  updatedAt: string
}

export interface Reservation {
  id: number
  reservationCode: string
  hotelId: number
  roomTypeId: number
  roomId?: number
  guestName: string
  guestPhone: string
  guestEmail?: string
  checkInDate: string
  checkOutDate: string
  adults: number
  children: number
  totalNights: number
  totalAmount: number
  paymentStatus: number
  specialRequests?: string
  status: number
  createdAt: string
  updatedAt: string
  hotel: Hotel
  roomType: RoomType
  room?: Room
}

export interface RoomPrice {
  id: number
  roomTypeId: number
  priceDate: string
  price: number
  isWeekend: number
  isHoliday: number
  createdAt: string
}

// API 요청/응답 타입
export interface CreateReservationRequest {
  roomTypeId: number
  checkInDate: string
  checkOutDate: string
  guestName: string
  guestPhone: string
  guestEmail?: string
  adults: number
  children: number
  specialRequests?: string
}

export interface CreateReservationResponse {
  success: boolean
  reservation: {
    id: number
    reservationCode: string
    hotelName: string
    roomTypeName: string
    checkInDate: string
    checkOutDate: string
    totalNights: number
    totalAmount: number
    guestName: string
    guestPhone: string
    adults: number
    children: number
    status: number
    paymentStatus: number
  }
}

export interface AvailabilityRequest {
  roomTypeId: number
  checkInDate: string
  checkOutDate: string
}

export interface AvailabilityResponse {
  available: boolean
  roomType: {
    id: number
    name: string
    hotelName: string
  }
  checkInDate: string
  checkOutDate: string
  nights: number
  totalPrice: number
  pricePerNight: number
}

export interface ReservationDetailResponse {
  reservationCode: string
  hotel: {
    id: number
    name: string
    address: string
    phone: string
    checkInTime: string
    checkOutTime: string
  }
  roomType: {
    id: number
    name: string
    description?: string
    maxOccupancy: number
    bedType?: string
  }
  room?: {
    id: number
    roomNumber: string
    floor?: number
  }
  guestInfo: {
    name: string
    phone: string
    email?: string
  }
  dates: {
    checkInDate: string
    checkOutDate: string
    totalNights: number
  }
  occupancy: {
    adults: number
    children: number
    total: number
  }
  pricing: {
    totalAmount: number
    pricePerNight: number
  }
  status: {
    reservation: number
    reservationText: string
    payment: number
    paymentText: string
  }
  specialRequests?: string
  createdAt: string
  updatedAt: string
}

// 상태 열거형
export enum ReservationStatus {
  CANCELLED = 0,
  CONFIRMED = 1,
  CHECKED_IN = 2,
  CHECKED_OUT = 3
}

export enum PaymentStatus {
  UNPAID = 0,
  PAID = 1,
  REFUNDED = 2
}

export enum RoomStatus {
  UNAVAILABLE = 0,
  AVAILABLE = 1,
  MAINTENANCE = 2
}

export enum HotelStatus {
  INACTIVE = 0,
  ACTIVE = 1
}
