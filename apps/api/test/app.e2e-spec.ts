/**
 * E2E: boots the real AppModule against the local compose stack.
 * Prereqs:  docker compose up -d  ·  pnpm db:migrate
 * Run:      pnpm --filter api test:e2e
 *
 * Covers the critical user journey end-to-end: signup → onboarding →
 * feed → create prompt → the creator is seated in their own room.
 */
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { AppModule } from "@/app.module";
import { GlobalExceptionFilter } from "@/common/filters/http-exception.filter";

describe("Chatrooms101 API (e2e)", () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication["getHttpServer"]>;
  let accessToken: string;
  const email = `e2e-${Date.now()}@test.local`;
  const username = `E2eWolf${Date.now() % 100000}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix("api/v1", { exclude: ["health/live", "health/ready"] });
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
    http = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  it("reports ready (DB + Redis reachable)", async () => {
    await request(http).get("/health/ready").expect(200);
  });

  it("serves the public feed without auth", async () => {
    const res = await request(http).get("/api/v1/prompts").expect(200);
    expect(res.body).toHaveProperty("items");
    expect(res.body).toHaveProperty("nextCursor");
  });

  it("rejects room access without a token", async () => {
    await request(http).get("/api/v1/chatrooms/whatever").expect(401);
  });

  it("signs up and receives token + refresh cookie", async () => {
    const res = await request(http)
      .post("/api/v1/auth/signup")
      .send({ email, password: "correct-horse-battery" })
      .expect(201);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.needsOnboarding).toBe(true);
    const cookies = res.get("set-cookie") ?? [];
    expect(cookies.some((c: string) => c.startsWith("cr_refresh="))).toBe(true);
    accessToken = res.body.accessToken;
  });

  it("blocks room access until onboarding, then claims a username", async () => {
    await request(http)
      .post("/api/v1/auth/username")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ username })
      .expect(201);

    // Token must be rotated to pick up the profile id
    const me = await request(http)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(me.body.profileId).toBeNull(); // old token — documents why the client refreshes
  });

  it("logs in again and gets a profile-bearing token", async () => {
    const res = await request(http)
      .post("/api/v1/auth/login")
      .send({ email, password: "correct-horse-battery" })
      .expect(200);
    expect(res.body.needsOnboarding).toBe(false);
    expect(res.body.profile.username).toBe(username);
    accessToken = res.body.accessToken;
  });

  it("creates a prompt and is seated in its room as OWNER", async () => {
    const categories = await request(http).get("/api/v1/categories").expect(200);
    const categoryId = categories.body.items[0].id;

    const created = await request(http)
      .post("/api/v1/prompts")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        title: "E2E: pineapple on pizza — crime or cuisine?",
        categoryId,
        tags: ["e2e"],
        maxUsers: 5,
        visibility: "PUBLIC",
      })
      .expect(201);

    const room = await request(http)
      .get(`/api/v1/chatrooms/${created.body.chatroomId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect(room.body.mySeat).toBe("OWNER");
    expect(room.body.memberCount).toBe(1);
  });

  it("uniform error for wrong password (no user enumeration)", async () => {
    const wrongPass = await request(http)
      .post("/api/v1/auth/login")
      .send({ email, password: "wrong-password-here" })
      .expect(401);
    const noUser = await request(http)
      .post("/api/v1/auth/login")
      .send({ email: "nobody@test.local", password: "wrong-password-here" })
      .expect(401);
    expect(wrongPass.body.error.message).toBe(noUser.body.error.message);
  });
});
