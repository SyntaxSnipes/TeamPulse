import type { FloorRoom } from "../types";

export const FLOOR_HEADER_HEIGHT = 38;
export const FLOOR_FOOTER_HEIGHT = 18;
export const FLOOR_SEAT_SIZE = 18;
export const FLOOR_SEAT_GAP = 2;

export type Seat = {
  index: number;
  x: number;
  y: number;
  size: number;
  overflow: boolean;
};

export function seatsForRoom(room: FloorRoom, occupantCount: number): Seat[] {
  const count = Math.max(room.capacity, occupantCount);
  if (count === 0) return [];
  const innerWidth = Math.max(room.w - 16, FLOOR_SEAT_SIZE);
  const columns = Math.max(1, Math.floor((innerWidth + FLOOR_SEAT_GAP) / (FLOOR_SEAT_SIZE + FLOOR_SEAT_GAP)));
  return Array.from({ length: count }, (_, index) => ({
    index,
    x: 8 + (index % columns) * (FLOOR_SEAT_SIZE + FLOOR_SEAT_GAP),
    y: FLOOR_HEADER_HEIGHT + 4 + Math.floor(index / columns) * (FLOOR_SEAT_SIZE + FLOOR_SEAT_GAP),
    size: FLOOR_SEAT_SIZE,
    overflow: index >= room.capacity,
  }));
}

export function roomBodyBounds(room: FloorRoom) {
  return {
    x: 0,
    y: FLOOR_HEADER_HEIGHT,
    width: room.w,
    height: Math.max(0, room.h - FLOOR_HEADER_HEIGHT - FLOOR_FOOTER_HEIGHT),
  };
}
