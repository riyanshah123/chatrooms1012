import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { TokenService } from "./token.service";
import { PrismaService } from "@/infra/prisma/prisma.service";

/**
 * The refresh-rotation state machine is the security core of auth — these
 * tests pin its three behaviors: rotate, reject, and family-revoke on reuse.
 */
describe("TokenService", () => {
  let prisma: {
    refreshToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let service: TokenService;

  beforeEach(() => {
    prisma = {
      refreshToken: {
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const config = {
      getOrThrow: (key: string) =>
        ({
          JWT_ACCESS_SECRET: "a".repeat(48),
          JWT_REFRESH_SECRET: "b".repeat(48),
          JWT_ACCESS_TTL: "15m",
          JWT_REFRESH_TTL: "30d",
        })[key],
    } as unknown as ConfigService;

    service = new TokenService(
      new JwtService({}),
      prisma as unknown as PrismaService,
      config,
    );
  });

  it("issues refresh tokens stored as a hash, never plaintext", async () => {
    const { token } = await service.issueRefreshToken("user1", {});
    const stored = prisma.refreshToken.create.mock.calls[0][0].data;
    expect(stored.tokenHash).toBeDefined();
    expect(stored.tokenHash).not.toBe(token);
    expect(stored.tokenHash).toHaveLength(64); // sha256 hex
  });

  it("rotates: revokes the presented token and issues a linked successor", async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: "row1",
      userId: "user1",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const result = await service.rotateRefreshToken("presented", {});

    expect(result.userId).toBe("user1");
    expect(prisma.refreshToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "row1" } }),
    );
    const created = prisma.refreshToken.create.mock.calls[0][0].data;
    expect(created.replaces).toEqual({ connect: { id: "row1" } });
  });

  it("rejects unknown tokens", async () => {
    prisma.refreshToken.findUnique.mockResolvedValue(null);
    await expect(service.rotateRefreshToken("nope", {})).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("rejects expired tokens", async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: "row1",
      userId: "user1",
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1),
    });
    await expect(service.rotateRefreshToken("old", {})).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("REUSE of a revoked token revokes the whole session family", async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: "row1",
      userId: "user1",
      revokedAt: new Date(), // already rotated once — this is a stolen token
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(service.rotateRefreshToken("stolen", {})).rejects.toThrow(
      UnauthorizedException,
    );
    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: "user1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
