import { NextResponse, type NextRequest } from "next/server";
import { cleanEnvValue } from "@/lib/server/env";
import {
  buildWechatTextReply,
  parseWechatInbound,
  verifyWechatSignature,
} from "@/lib/server/wechat-crypto";
import {
  consumeWechatBindCode,
  linkWechatOpenid,
  lookupUserByOpenid,
} from "@/lib/server/wechat-store";
import { parseTodosWithKimi } from "@/lib/server/todo-parse-engine";
import { applyParsedItemsToUser } from "@/lib/server/apply-parsed-items";

export const runtime = "nodejs";

/**
 * WeChat 公众号 webhook.
 *
 * GET  — Tencent handshake. Returns the `echostr` query param when the
 *        signature matches, otherwise 403. Run once when you configure
 *        the server URL in 公众号 backend; never called again.
 *
 * POST — Incoming user message. Always responds < 1 s with a plain
 *        "已收到 / 正在处理 / 已绑定" XML reply. The actual Kimi parse
 *        + DB write happens in a fire-and-forget Promise so the SLA
 *        stays comfortable.
 *
 * Bind flow: a user sends `bind 123456` after generating a code in the
 * app's Settings → WeChat panel. We swap that for an openid→user link
 * and reply with confirmation. All subsequent messages from the same
 * openid get parsed and added to that user's account.
 */

const BIND_COMMAND_RE = /^\s*bind\s+(\d{6})\s*$/i;

function getToken(): string | null {
  return cleanEnvValue(process.env.WECHAT_TOKEN);
}

export async function GET(request: NextRequest) {
  const token = getToken();
  if (!token) {
    return NextResponse.json(
      { error: "Server misconfiguration: WECHAT_TOKEN missing." },
      { status: 503 },
    );
  }
  const url = request.nextUrl;
  const signature = url.searchParams.get("signature") ?? "";
  const timestamp = url.searchParams.get("timestamp") ?? "";
  const nonce = url.searchParams.get("nonce") ?? "";
  const echostr = url.searchParams.get("echostr") ?? "";
  if (!verifyWechatSignature(signature, { token, timestamp, nonce })) {
    return new NextResponse("forbidden", { status: 403 });
  }
  return new NextResponse(echostr, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

export async function POST(request: NextRequest) {
  const token = getToken();
  if (!token) {
    // Without a token we can't even verify the request is from Tencent.
    // Returning success literal would cause Tencent to retry forever.
    return new NextResponse("missing token", { status: 503 });
  }

  const url = request.nextUrl;
  const signature = url.searchParams.get("signature") ?? "";
  const timestamp = url.searchParams.get("timestamp") ?? "";
  const nonce = url.searchParams.get("nonce") ?? "";
  if (!verifyWechatSignature(signature, { token, timestamp, nonce })) {
    return new NextResponse("forbidden", { status: 403 });
  }

  const xml = await request.text();
  const inbound = parseWechatInbound(xml);
  if (!inbound) {
    // Tencent treats "success" as a no-reply ACK. Use it for malformed
    // payloads to avoid retry loops.
    return new NextResponse("success", { status: 200 });
  }

  const fromUser = inbound.fromUser;
  const ourAccount = inbound.toUser;
  const text = inbound.content.trim();

  // Only text triggers anything for now. Images / voice / etc. get a
  // polite "not supported" so the user knows we received them.
  if (inbound.msgType !== "text") {
    return reply(ourAccount, fromUser, "暂时只支持文字消息哦。");
  }

  // 1) Bind command: "bind 123456"
  const bindMatch = text.match(BIND_COMMAND_RE);
  if (bindMatch) {
    const code = bindMatch[1];
    try {
      const userId = await consumeWechatBindCode(code);
      if (!userId) {
        return reply(
          ourAccount,
          fromUser,
          "绑定码无效或已过期。请回 app 重新生成一个 6 位码。",
        );
      }
      await linkWechatOpenid({ openid: fromUser, userId });
      return reply(
        ourAccount,
        fromUser,
        "✅ 已绑定。现在可以直接发想加的 todo / event 啦。",
      );
    } catch (error) {
      console.error("[wechat-webhook] bind failed", error);
      return reply(ourAccount, fromUser, "绑定失败,请稍后再试。");
    }
  }

  // 2) Regular message: must be from a bound openid.
  const userId = await lookupUserByOpenid(fromUser);
  if (!userId) {
    return reply(
      ourAccount,
      fromUser,
      "你还没绑定 Lizhi 账号。请去 app → Settings → WeChat 生成 6 位码后发 `bind XXXXXX` 给我。",
    );
  }

  // 3) Fire-and-forget parse + write. We DON'T await this — the reply
  // must go back to Tencent within ~5s and Kimi can be slow.
  void processInboundMessage({
    userId,
    openid: fromUser,
    text,
  }).catch((error) => {
    console.error("[wechat-webhook] async parse failed", {
      openid: fromUser,
      userId,
      error,
    });
  });

  return reply(
    ourAccount,
    fromUser,
    "✅ 已收到,正在处理。打开 app 查看结果。",
  );
}

function reply(ourAccount: string, toUser: string, content: string) {
  const xml = buildWechatTextReply({
    toUser,
    fromUser: ourAccount,
    content,
  });
  return new NextResponse(xml, {
    status: 200,
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}

async function processInboundMessage(params: {
  userId: string;
  openid: string;
  text: string;
}) {
  const selectedDate = new Date().toISOString().slice(0, 10);
  const parsed = await parseTodosWithKimi({
    text: params.text,
    selectedDate,
    existingLists: [],
  });
  const summary = await applyParsedItemsToUser({
    userId: params.userId,
    candidates: parsed.todos,
  });
  console.log("[wechat-webhook] applied", {
    openid: params.openid,
    userId: params.userId,
    textPreview: params.text.slice(0, 80),
    todosAdded: summary.todosAdded,
    eventsAdded: summary.eventsAdded,
    lists: summary.lists,
    errors: summary.errors,
    warnings: parsed.warnings,
  });
}
