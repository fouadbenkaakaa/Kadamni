import { z } from "zod";

// These mirror RegisterRequest / LoginRequest in lib/api-spec/openapi.yaml.
// Once the front-end moves to the generated @workspace/api-zod client we can
// swap these out for the generated schemas — kept hand-written for now so
// the server doesn't depend on running codegen to build.

export const registerSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email().optional(),
  phone: z.string().min(6).optional(),
  password: z.string().min(8),
  accountType: z.enum(["seeker", "employer", "worker"]),
  city: z.string().optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  identifier: z.string().min(3),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;
