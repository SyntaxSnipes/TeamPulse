import { describe, expect, it } from "vitest";
import { roomBodyBounds, seatsForRoom } from "./floor-plan";
import type { FloorRoom } from "../types";

const room: FloorRoom = {
  id: "WAIT", label: "Waiting room", type: "WAITING", dept: "FRONT_DESK",
  x: 20, y: 20, w: 220, h: 110, capacity: 20,
};

describe("floor plan seat geometry", () => {
  it("renders capacity seats and keeps every seat in the room body without overlap", () => {
    const seats = seatsForRoom(room, 0);
    const body = roomBodyBounds(room);
    expect(seats).toHaveLength(room.capacity);
    expect(seats.every((seat) => seat.x >= body.x && seat.y >= body.y &&
      seat.x + seat.size <= body.width && seat.y + seat.size <= body.height + body.y)).toBe(true);
    expect(new Set(seats.map((seat) => `${seat.x}:${seat.y}`)).size).toBe(seats.length);
  });

  it("adds explicitly marked overflow seats", () => {
    const seats = seatsForRoom({ ...room, capacity: 1 }, 3);
    expect(seats).toHaveLength(3);
    expect(seats.filter((seat) => seat.overflow)).toHaveLength(2);
  });
});
