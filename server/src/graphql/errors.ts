import { GraphQLError } from "graphql";
import type { YogaServerOptions } from "graphql-yoga";
import { ZodError } from "zod";
import { HttpError } from "../lib/errors.js";

export const formatError: NonNullable<YogaServerOptions<{}, {}>["maskedErrors"]> = {
  maskError(error, message, isDev) {
    const original = error as GraphQLError;
    const cause = original.originalError ?? error;

    if (cause instanceof HttpError) {
      const code =
        cause.status === 401
          ? "UNAUTHENTICATED"
          : cause.status === 403
            ? "FORBIDDEN"
            : cause.status === 404
              ? "NOT_FOUND"
              : "BAD_USER_INPUT";
      return new GraphQLError(cause.message, {
        extensions: {
          code,
          details: cause.details,
          http: { status: cause.status },
        },
      });
    }

    if (cause instanceof ZodError) {
      return new GraphQLError("Validation failed", {
        extensions: {
          code: "VALIDATION_FAILED",
          details: cause.issues,
          http: { status: 400 },
        },
      });
    }

    if (isDev) return error as GraphQLError;
    return new GraphQLError(message);
  },
};
