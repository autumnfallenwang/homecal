import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "../../src/db/schema.js";

const { users, events, eventLogs } = schema;

const TEST_DATABASE_URL = process.env.DATABASE_URL;
if (!TEST_DATABASE_URL) {
  throw new Error("DATABASE_URL is required — ensure apps/api/.env exists");
}

let client: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeAll(() => {
  client = postgres(TEST_DATABASE_URL);
  db = drizzle(client, { schema });
});

afterAll(async () => {
  await client.end();
});

beforeEach(async () => {
  // Clean tables in FK-safe order
  await db.delete(eventLogs);
  await db.delete(events);
  await db.delete(users);
});

describe("users table", () => {
  it("inserts and retrieves a user", async () => {
    const [user] = await db
      .insert(users)
      .values({ name: "Alice", color: "#ff0000", passwordHash: "hash123" })
      .returning();

    expect(user.id).toBeDefined();
    expect(user.name).toBe("Alice");
    expect(user.color).toBe("#ff0000");
    expect(user.createdAt).toBeInstanceOf(Date);
  });

  it("generates unique uuid primary keys", async () => {
    const inserted = await db
      .insert(users)
      .values([
        { name: "Alice", color: "#ff0000", passwordHash: "hash1" },
        { name: "Bob", color: "#0000ff", passwordHash: "hash2" },
      ])
      .returning();

    expect(inserted[0].id).not.toBe(inserted[1].id);
  });
});

describe("events table", () => {
  it("inserts an event linked to a user", async () => {
    const [user] = await db
      .insert(users)
      .values({ name: "Alice", color: "#ff0000", passwordHash: "hash" })
      .returning();

    const [event] = await db
      .insert(events)
      .values({
        title: "Dentist",
        start: new Date("2026-03-01T10:00:00Z"),
        end: new Date("2026-03-01T11:00:00Z"),
        ownerId: user.id,
      })
      .returning();

    expect(event.id).toBeDefined();
    expect(event.title).toBe("Dentist");
    expect(event.ownerId).toBe(user.id);
    expect(event.private).toBe(false);
    expect(event.createdAt).toBeInstanceOf(Date);
    expect(event.updatedAt).toBeInstanceOf(Date);
  });

  it("enforces foreign key constraint on ownerId", async () => {
    const fakeUserId = "00000000-0000-0000-0000-000000000000";
    await expect(
      db.insert(events).values({
        title: "Orphan event",
        start: new Date(),
        end: new Date(),
        ownerId: fakeUserId,
      }),
    ).rejects.toThrow();
  });

  it("cascades delete from user to events", async () => {
    const [user] = await db
      .insert(users)
      .values({ name: "Alice", color: "#ff0000", passwordHash: "hash" })
      .returning();

    await db.insert(events).values({
      title: "Dentist",
      start: new Date("2026-03-01T10:00:00Z"),
      end: new Date("2026-03-01T11:00:00Z"),
      ownerId: user.id,
    });

    await db.delete(users).where(eq(users.id, user.id));

    const remaining = await db.select().from(events);
    expect(remaining).toHaveLength(0);
  });
});

describe("eventLogs table", () => {
  it("inserts a log entry with changes", async () => {
    const [user] = await db
      .insert(users)
      .values({ name: "Alice", color: "#ff0000", passwordHash: "hash" })
      .returning();

    const [event] = await db
      .insert(events)
      .values({
        title: "Dentist",
        start: new Date("2026-03-01T10:00:00Z"),
        end: new Date("2026-03-01T11:00:00Z"),
        ownerId: user.id,
      })
      .returning();

    const [log] = await db
      .insert(eventLogs)
      .values({
        eventId: event.id,
        userId: user.id,
        action: "create",
        changes: { title: { from: null, to: "Dentist" } },
      })
      .returning();

    expect(log.id).toBeDefined();
    expect(log.action).toBe("create");
    expect(log.changes).toEqual({ title: { from: null, to: "Dentist" } });
    expect(log.timestamp).toBeInstanceOf(Date);
  });

  it("allows null changes", async () => {
    const [user] = await db
      .insert(users)
      .values({ name: "Alice", color: "#ff0000", passwordHash: "hash" })
      .returning();

    const [event] = await db
      .insert(events)
      .values({
        title: "Dentist",
        start: new Date("2026-03-01T10:00:00Z"),
        end: new Date("2026-03-01T11:00:00Z"),
        ownerId: user.id,
      })
      .returning();

    const [log] = await db
      .insert(eventLogs)
      .values({
        eventId: event.id,
        userId: user.id,
        action: "delete",
      })
      .returning();

    expect(log.changes).toBeNull();
  });

  it("cascades delete from event to logs", async () => {
    const [user] = await db
      .insert(users)
      .values({ name: "Alice", color: "#ff0000", passwordHash: "hash" })
      .returning();

    const [event] = await db
      .insert(events)
      .values({
        title: "Dentist",
        start: new Date("2026-03-01T10:00:00Z"),
        end: new Date("2026-03-01T11:00:00Z"),
        ownerId: user.id,
      })
      .returning();

    await db.insert(eventLogs).values({
      eventId: event.id,
      userId: user.id,
      action: "create",
    });

    await db.delete(events).where(eq(events.id, event.id));

    const remaining = await db.select().from(eventLogs);
    expect(remaining).toHaveLength(0);
  });
});

describe("relational queries", () => {
  it("queries user with their events", async () => {
    const [user] = await db
      .insert(users)
      .values({ name: "Alice", color: "#ff0000", passwordHash: "hash" })
      .returning();

    await db.insert(events).values([
      {
        title: "Dentist",
        start: new Date("2026-03-01T10:00:00Z"),
        end: new Date("2026-03-01T11:00:00Z"),
        ownerId: user.id,
      },
      {
        title: "Gym",
        start: new Date("2026-03-02T18:00:00Z"),
        end: new Date("2026-03-02T19:00:00Z"),
        ownerId: user.id,
      },
    ]);

    const result = await db.query.users.findFirst({
      where: eq(users.id, user.id),
      with: { events: true },
    });

    expect(result?.events).toHaveLength(2);
    expect(result?.events.map((e) => e.title).sort()).toEqual(["Dentist", "Gym"]);
  });

  it("queries event with owner and logs", async () => {
    const [user] = await db
      .insert(users)
      .values({ name: "Alice", color: "#ff0000", passwordHash: "hash" })
      .returning();

    const [event] = await db
      .insert(events)
      .values({
        title: "Dentist",
        start: new Date("2026-03-01T10:00:00Z"),
        end: new Date("2026-03-01T11:00:00Z"),
        ownerId: user.id,
      })
      .returning();

    await db.insert(eventLogs).values({
      eventId: event.id,
      userId: user.id,
      action: "create",
    });

    const result = await db.query.events.findFirst({
      where: eq(events.id, event.id),
      with: { owner: true, logs: true },
    });

    expect(result?.owner.name).toBe("Alice");
    expect(result?.logs).toHaveLength(1);
    expect(result?.logs[0].action).toBe("create");
  });
});
