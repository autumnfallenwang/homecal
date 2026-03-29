import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "../../src/db/schema.js";

const { users, events, eventAssignees, eventLogs, sessions, accounts } = schema;

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
  await db.delete(eventAssignees);
  await db.delete(eventLogs);
  await db.delete(events);
  await db.delete(sessions);
  await db.delete(accounts);
  await db.delete(users);
});

describe("users table", () => {
  it("inserts and retrieves a user", async () => {
    const [user] = await db
      .insert(users)
      .values({ name: "Alice", email: "alice@test.com", emailVerified: false, color: "#ff0000" })
      .returning();

    expect(user.id).toBeDefined();
    expect(user.name).toBe("Alice");
    expect(user.email).toBe("alice@test.com");
    expect(user.color).toBe("#ff0000");
    expect(user.role).toBe("user");
    expect(user.createdAt).toBeInstanceOf(Date);
  });

  it("generates unique uuid primary keys", async () => {
    const inserted = await db
      .insert(users)
      .values([
        { name: "Alice", email: "alice@test.com", emailVerified: false, color: "#ff0000" },
        { name: "Bob", email: "bob@test.com", emailVerified: false, color: "#0000ff" },
      ])
      .returning();

    expect(inserted[0].id).not.toBe(inserted[1].id);
  });

  it("enforces unique email constraint", async () => {
    await db
      .insert(users)
      .values({ name: "Alice", email: "alice@test.com", emailVerified: false, color: "#ff0000" });

    await expect(
      db.insert(users).values({
        name: "Alice2",
        email: "alice@test.com",
        emailVerified: false,
        color: "#00ff00",
      }),
    ).rejects.toThrow();
  });
});

describe("sessions table", () => {
  it("inserts a session linked to a user", async () => {
    const [user] = await db
      .insert(users)
      .values({ name: "Alice", email: "alice@test.com", emailVerified: false, color: "#ff0000" })
      .returning();

    const [session] = await db
      .insert(sessions)
      .values({
        userId: user.id,
        token: "test-token-123",
        expiresAt: new Date("2026-12-31T00:00:00Z"),
      })
      .returning();

    expect(session.id).toBeDefined();
    expect(session.userId).toBe(user.id);
    expect(session.token).toBe("test-token-123");
    expect(session.expiresAt).toBeInstanceOf(Date);
  });

  it("cascades delete from user to sessions", async () => {
    const [user] = await db
      .insert(users)
      .values({ name: "Alice", email: "alice@test.com", emailVerified: false, color: "#ff0000" })
      .returning();

    await db.insert(sessions).values({
      userId: user.id,
      token: "test-token",
      expiresAt: new Date("2026-12-31T00:00:00Z"),
    });

    await db.delete(users).where(eq(users.id, user.id));

    const remaining = await db.select().from(sessions);
    expect(remaining).toHaveLength(0);
  });
});

describe("accounts table", () => {
  it("inserts an account linked to a user", async () => {
    const [user] = await db
      .insert(users)
      .values({ name: "Alice", email: "alice@test.com", emailVerified: false, color: "#ff0000" })
      .returning();

    const [account] = await db
      .insert(accounts)
      .values({
        userId: user.id,
        accountId: user.id,
        providerId: "credential",
        password: "hashed-password",
      })
      .returning();

    expect(account.id).toBeDefined();
    expect(account.userId).toBe(user.id);
    expect(account.providerId).toBe("credential");
  });

  it("cascades delete from user to accounts", async () => {
    const [user] = await db
      .insert(users)
      .values({ name: "Alice", email: "alice@test.com", emailVerified: false, color: "#ff0000" })
      .returning();

    await db.insert(accounts).values({
      userId: user.id,
      accountId: user.id,
      providerId: "credential",
    });

    await db.delete(users).where(eq(users.id, user.id));

    const remaining = await db.select().from(accounts);
    expect(remaining).toHaveLength(0);
  });
});

describe("events table", () => {
  it("inserts an event linked to a user", async () => {
    const [user] = await db
      .insert(users)
      .values({ name: "Alice", email: "alice@test.com", emailVerified: false, color: "#ff0000" })
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
      .values({ name: "Alice", email: "alice@test.com", emailVerified: false, color: "#ff0000" })
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
      .values({ name: "Alice", email: "alice@test.com", emailVerified: false, color: "#ff0000" })
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
      .values({ name: "Alice", email: "alice@test.com", emailVerified: false, color: "#ff0000" })
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
      .values({ name: "Alice", email: "alice@test.com", emailVerified: false, color: "#ff0000" })
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

describe("eventAssignees table", () => {
  it("inserts an assignee linked to event and user", async () => {
    const [user] = await db
      .insert(users)
      .values({ name: "Alice", email: "alice@test.com", emailVerified: false, color: "#ff0000" })
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

    const [assignee] = await db
      .insert(eventAssignees)
      .values({ eventId: event.id, userId: user.id })
      .returning();

    expect(assignee.id).toBeDefined();
    expect(assignee.eventId).toBe(event.id);
    expect(assignee.userId).toBe(user.id);
  });

  it("enforces unique constraint on (eventId, userId)", async () => {
    const [user] = await db
      .insert(users)
      .values({ name: "Alice", email: "alice@test.com", emailVerified: false, color: "#ff0000" })
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

    await db.insert(eventAssignees).values({ eventId: event.id, userId: user.id });

    await expect(
      db.insert(eventAssignees).values({ eventId: event.id, userId: user.id }),
    ).rejects.toThrow();
  });

  it("enforces foreign key constraint on eventId", async () => {
    const [user] = await db
      .insert(users)
      .values({ name: "Alice", email: "alice@test.com", emailVerified: false, color: "#ff0000" })
      .returning();

    const fakeEventId = "00000000-0000-0000-0000-000000000000";
    await expect(
      db.insert(eventAssignees).values({ eventId: fakeEventId, userId: user.id }),
    ).rejects.toThrow();
  });

  it("enforces foreign key constraint on userId", async () => {
    const [user] = await db
      .insert(users)
      .values({ name: "Alice", email: "alice@test.com", emailVerified: false, color: "#ff0000" })
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

    const fakeUserId = "00000000-0000-0000-0000-000000000000";
    await expect(
      db.insert(eventAssignees).values({ eventId: event.id, userId: fakeUserId }),
    ).rejects.toThrow();
  });

  it("cascades delete from event to assignees", async () => {
    const [user] = await db
      .insert(users)
      .values({ name: "Alice", email: "alice@test.com", emailVerified: false, color: "#ff0000" })
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

    await db.insert(eventAssignees).values({ eventId: event.id, userId: user.id });

    await db.delete(events).where(eq(events.id, event.id));

    const remaining = await db.select().from(eventAssignees);
    expect(remaining).toHaveLength(0);
  });

  it("cascades delete from user to assignees", async () => {
    const [user] = await db
      .insert(users)
      .values({ name: "Alice", email: "alice@test.com", emailVerified: false, color: "#ff0000" })
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

    // Add a second user as assignee so we can delete them without cascading through events
    const [user2] = await db
      .insert(users)
      .values({ name: "Bob", email: "bob@test.com", emailVerified: false, color: "#0000ff" })
      .returning();

    await db.insert(eventAssignees).values({ eventId: event.id, userId: user2.id });

    await db.delete(users).where(eq(users.id, user2.id));

    const remaining = await db.select().from(eventAssignees);
    expect(remaining).toHaveLength(0);
  });
});

describe("relational queries", () => {
  it("queries user with their events", async () => {
    const [user] = await db
      .insert(users)
      .values({ name: "Alice", email: "alice@test.com", emailVerified: false, color: "#ff0000" })
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
      .values({ name: "Alice", email: "alice@test.com", emailVerified: false, color: "#ff0000" })
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

  it("queries user with sessions and accounts", async () => {
    const [user] = await db
      .insert(users)
      .values({ name: "Alice", email: "alice@test.com", emailVerified: false, color: "#ff0000" })
      .returning();

    await db.insert(sessions).values({
      userId: user.id,
      token: "session-token",
      expiresAt: new Date("2026-12-31T00:00:00Z"),
    });

    await db.insert(accounts).values({
      userId: user.id,
      accountId: user.id,
      providerId: "credential",
    });

    const result = await db.query.users.findFirst({
      where: eq(users.id, user.id),
      with: { sessions: true, accounts: true },
    });

    expect(result?.sessions).toHaveLength(1);
    expect(result?.accounts).toHaveLength(1);
    expect(result?.sessions[0].token).toBe("session-token");
    expect(result?.accounts[0].providerId).toBe("credential");
  });

  it("queries event with assignees", async () => {
    const [user] = await db
      .insert(users)
      .values({ name: "Alice", email: "alice@test.com", emailVerified: false, color: "#ff0000" })
      .returning();

    const [user2] = await db
      .insert(users)
      .values({ name: "Bob", email: "bob@test.com", emailVerified: false, color: "#0000ff" })
      .returning();

    const [event] = await db
      .insert(events)
      .values({
        title: "Family dinner",
        start: new Date("2026-03-01T18:00:00Z"),
        end: new Date("2026-03-01T20:00:00Z"),
        ownerId: user.id,
      })
      .returning();

    await db.insert(eventAssignees).values([
      { eventId: event.id, userId: user.id },
      { eventId: event.id, userId: user2.id },
    ]);

    const result = await db.query.events.findFirst({
      where: eq(events.id, event.id),
      with: { assignees: true },
    });

    expect(result?.assignees).toHaveLength(2);
  });

  it("queries assignee with user details", async () => {
    const [user] = await db
      .insert(users)
      .values({ name: "Alice", email: "alice@test.com", emailVerified: false, color: "#ff0000" })
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

    await db.insert(eventAssignees).values({ eventId: event.id, userId: user.id });

    const result = await db.query.eventAssignees.findFirst({
      where: eq(eventAssignees.eventId, event.id),
      with: { user: true },
    });

    expect(result?.user.name).toBe("Alice");
    expect(result?.user.color).toBe("#ff0000");
  });
});
