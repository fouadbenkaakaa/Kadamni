import { Router, type IRouter } from "express";
import { and, desc, eq, ne, or } from "drizzle-orm";
import {
  db,
  conversationsTable,
  messagesTable,
  usersTable,
} from "@workspace/db";
import { z } from "zod";
import { requireAuth } from "../middlewares/auth";
import { toPublicUser } from "../lib/public-user";

const router: IRouter = Router();

router.use(requireAuth);

// GET /api/conversations — list the current user's conversations, each with
// the other participant's public profile and the most recent message.
router.get("/conversations", async (req, res) => {
  const me = req.user!.id;

  const rows = await db
    .select()
    .from(conversationsTable)
    .where(
      or(
        eq(conversationsTable.participantOneId, me),
        eq(conversationsTable.participantTwoId, me),
      ),
    )
    .orderBy(desc(conversationsTable.lastMessageAt));

  const expanded = await Promise.all(
    rows.map(async (conv) => {
      const otherId =
        conv.participantOneId === me
          ? conv.participantTwoId
          : conv.participantOneId;

      const [other] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, otherId))
        .limit(1);

      const [lastMessage] = await db
        .select()
        .from(messagesTable)
        .where(eq(messagesTable.conversationId, conv.id))
        .orderBy(desc(messagesTable.createdAt))
        .limit(1);

      return {
        ...conv,
        otherUser: other ? toPublicUser(other) : null,
        lastMessage: lastMessage ?? null,
      };
    }),
  );

  res.json({ conversations: expanded });
});

// POST /api/conversations — get-or-create a conversation with another user.
const startConversationSchema = z.object({ otherUserId: z.string().uuid() });

router.post("/conversations", async (req, res) => {
  const parsed = startConversationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات غير صالحة" });
    return;
  }
  const me = req.user!.id;
  const { otherUserId } = parsed.data;

  if (otherUserId === me) {
    res.status(400).json({ error: "لا يمكن بدء محادثة مع نفسك" });
    return;
  }

  const [existing] = await db
    .select()
    .from(conversationsTable)
    .where(
      or(
        and(
          eq(conversationsTable.participantOneId, me),
          eq(conversationsTable.participantTwoId, otherUserId),
        ),
        and(
          eq(conversationsTable.participantOneId, otherUserId),
          eq(conversationsTable.participantTwoId, me),
        ),
      ),
    )
    .limit(1);

  if (existing) {
    res.json({ conversation: existing });
    return;
  }

  const [conversation] = await db
    .insert(conversationsTable)
    .values({ participantOneId: me, participantTwoId: otherUserId })
    .returning();

  res.status(201).json({ conversation });
});

// GET /api/conversations/:id/messages
router.get("/conversations/:id/messages", async (req, res) => {
  const me = req.user!.id;

  const [conv] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, req.params.id))
    .limit(1);

  if (!conv || (conv.participantOneId !== me && conv.participantTwoId !== me)) {
    res.status(404).json({ error: "المحادثة غير موجودة" });
    return;
  }

  // Mark the other participant's messages as read *before* selecting, so
  // the response the caller sees already reflects the final state — and
  // only their incoming messages, never the current user's own sent ones.
  await db
    .update(messagesTable)
    .set({ read: true })
    .where(
      and(
        eq(messagesTable.conversationId, req.params.id),
        eq(messagesTable.read, false),
        ne(messagesTable.senderId, me),
      ),
    );

  const messages = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.conversationId, req.params.id))
    .orderBy(messagesTable.createdAt);

  res.json({ messages });
});

// POST /api/conversations/:id/messages
const sendMessageSchema = z.object({
  type: z.enum(["text", "image", "file", "location", "voice"]).default("text"),
  content: z.string().min(1),
});

router.post("/conversations/:id/messages", async (req, res) => {
  const me = req.user!.id;

  const [conv] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, req.params.id))
    .limit(1);

  if (!conv || (conv.participantOneId !== me && conv.participantTwoId !== me)) {
    res.status(404).json({ error: "المحادثة غير موجودة" });
    return;
  }

  const parsed = sendMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "بيانات غير صالحة" });
    return;
  }

  const [message] = await db
    .insert(messagesTable)
    .values({
      conversationId: req.params.id,
      senderId: me,
      type: parsed.data.type,
      content: parsed.data.content,
    })
    .returning();

  await db
    .update(conversationsTable)
    .set({ lastMessageAt: new Date() })
    .where(eq(conversationsTable.id, req.params.id));

  res.status(201).json({ message });
});

export default router;
