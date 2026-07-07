import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";

export class UserPreferencesService {
  async getPreference(params: { ownerUserId: string; key: string }) {
    const preference = await prisma.userPreference.findUnique({
      where: {
        ownerUserId_preferenceKey: {
          ownerUserId: params.ownerUserId,
          preferenceKey: params.key,
        },
      },
    });

    return {
      key: params.key,
      value: preference?.valueJsonb ?? null,
    };
  }

  async savePreference(params: {
    ownerUserId: string;
    key: string;
    value: unknown;
  }) {
    await prisma.userPreference.upsert({
      where: {
        ownerUserId_preferenceKey: {
          ownerUserId: params.ownerUserId,
          preferenceKey: params.key,
        },
      },
      create: {
        ownerUserId: params.ownerUserId,
        preferenceKey: params.key,
        valueJsonb: params.value as Prisma.InputJsonValue,
      },
      update: {
        valueJsonb: params.value as Prisma.InputJsonValue,
      },
    });

    return {
      key: params.key,
      value: params.value,
    };
  }
}

export const userPreferencesService = new UserPreferencesService();
