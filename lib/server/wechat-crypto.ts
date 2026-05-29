import { createHash } from "crypto";

/**
 * WeChat 公众号 webhook signature verification + minimal XML helpers.
 *
 * Tencent posts inbound messages as XML and signs every request (incl.
 * the initial GET handshake) with sha1([token, timestamp, nonce] sorted
 * alphabetically, concatenated). We're operating in plaintext mode
 * (no AES) so the body itself doesn't need decryption — just signature
 * verification + simple text extraction.
 */

/**
 * Compute the signature Tencent expects. The algorithm is:
 *   sha1(sort([token, timestamp, nonce]).join(""))
 * Returns the lowercase hex digest.
 */
export function computeWechatSignature(params: {
  token: string;
  timestamp: string;
  nonce: string;
}): string {
  const items = [params.token, params.timestamp, params.nonce].sort();
  return createHash("sha1").update(items.join("")).digest("hex");
}

export function verifyWechatSignature(
  expected: string,
  params: { token: string; timestamp: string; nonce: string },
): boolean {
  if (!expected) return false;
  return computeWechatSignature(params) === expected;
}

/**
 * Extract the contents of a top-level <tag>...</tag> element from a
 * WeChat XML message. Handles both CDATA-wrapped and bare content. We
 * use this instead of a full XML parser because the payloads we care
 * about have at most a dozen flat string fields. Returns null when the
 * tag isn't present.
 */
export function getWechatField(xml: string, tag: string): string | null {
  // Match either:  <Tag><![CDATA[value]]></Tag>  or  <Tag>value</Tag>
  const cdataRe = new RegExp(
    `<${tag}>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`,
    "i",
  );
  const cdataMatch = xml.match(cdataRe);
  if (cdataMatch) return cdataMatch[1];
  const bareRe = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i");
  const bareMatch = xml.match(bareRe);
  return bareMatch ? bareMatch[1].trim() : null;
}

export type WechatInboundMessage = {
  /** Sender openid (the user). */
  fromUser: string;
  /** Recipient = our 公众号 raw id. */
  toUser: string;
  /** "text", "image", "voice", etc. We only act on "text". */
  msgType: string;
  /** Message body. Only meaningful when msgType === "text". */
  content: string;
  /** Tencent's unix-seconds timestamp. */
  createTime: string;
  /** Optional WeChat-side message id, for dedup. */
  msgId: string | null;
};

export function parseWechatInbound(xml: string): WechatInboundMessage | null {
  const fromUser = getWechatField(xml, "FromUserName");
  const toUser = getWechatField(xml, "ToUserName");
  const msgType = getWechatField(xml, "MsgType");
  const createTime = getWechatField(xml, "CreateTime");
  if (!fromUser || !toUser || !msgType || !createTime) return null;
  return {
    fromUser,
    toUser,
    msgType,
    createTime,
    content: getWechatField(xml, "Content") ?? "",
    msgId: getWechatField(xml, "MsgId"),
  };
}

/**
 * Build a plaintext-mode reply XML. The reply's ToUserName/FromUserName
 * fields are SWAPPED relative to the inbound message (we reply back to
 * the sender from our 公众号 account). Escapes nothing — wraps content
 * in CDATA so user-supplied text doesn't break the document.
 */
export function buildWechatTextReply(params: {
  /** The sender of the inbound message; becomes our reply's ToUserName. */
  toUser: string;
  /** Our 公众号 raw id; becomes our reply's FromUserName. */
  fromUser: string;
  content: string;
}): string {
  // CDATA cannot contain literal "]]>" — neutralise the closing token.
  const safe = params.content.replace(/]]>/g, "]]]]><![CDATA[>");
  const now = Math.floor(Date.now() / 1000);
  return `<xml>
<ToUserName><![CDATA[${params.toUser}]]></ToUserName>
<FromUserName><![CDATA[${params.fromUser}]]></FromUserName>
<CreateTime>${now}</CreateTime>
<MsgType><![CDATA[text]]></MsgType>
<Content><![CDATA[${safe}]]></Content>
</xml>`;
}
