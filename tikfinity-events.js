// Only gift/like counters needed for the public supporters board leave the PC.
// Chat messages, email addresses, cookies and TikFinity account details are ignored.
export function integer(value) {
  if (value && typeof value === 'object' && Number.isInteger(value.low) && Number.isInteger(value.high)) {
    value = value.high * 4294967296 + (value.low >>> 0);
  }
  const number = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

export function safeImage(value) {
  if (typeof value !== 'string' || value.length > 2000) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' && !url.username && !url.password &&
      ['tiktokcdn.com', 'tiktokcdn-us.com', 'tiktokcdn-eu.com', 'ibytedtos.com', 'byteoversea.com'].some(suffix => host === suffix || host.endsWith(`.${suffix}`))
      ? url.href : null;
  } catch { return null; }
}

function id(value) {
  if (typeof value === 'string' && /^[\w.:-]{1,128}$/.test(value)) return value;
  if (value && typeof value === 'object' && Number.isInteger(value.low) && Number.isInteger(value.high)) {
    if (value.high < 0 && value.unsigned !== true) return '';
    return ((BigInt(value.high >>> 0) << 32n) | BigInt(value.low >>> 0)).toString();
  }
  const number = integer(value);
  return number !== null ? String(number) : '';
}

export function normalizeTikFinityPacket(packet, now = Date.now()) {
  if (!packet || !['gift', 'like'].includes(packet.event)) return null;
  const data = packet.data;
  if (!data || data.isTest || data.testMode || packet.isTest) return null;
  const user = data.user || {};
  const messageId = id(data.msgId ?? data.messageId ?? data.common?.msgId);
  const viewerId = id(data.userId ?? user.userId ?? user.id);
  if (!messageId || !viewerId) return null;
  const handle = String(data.uniqueId ?? user.uniqueId ?? '').replace(/^@/, '').slice(0, 80);
  const avatar = data.profilePictureUrl ?? user.profilePictureUrl ?? user.avatarThumb?.urlList?.[0];
  const rawTime = integer(data.createTime ?? data.common?.createTime);
  const occurred = rawTime ? (rawTime < 1e12 ? rawTime * 1000 : rawTime) : now;
  if (occurred < now - 86400_000 || occurred > now + 300_000) return null;
  const base = {
    event_id: `${packet.event}:${messageId}`,
    kind: packet.event,
    viewer_id: viewerId,
    username: handle,
    nickname: String(data.nickname ?? user.nickname ?? handle ?? 'Viewer').slice(0, 100) || 'Viewer',
    avatar_url: safeImage(avatar),
    occurred_at: new Date(occurred).toISOString(),
    total_likes: Math.min(integer(data.totalLikeCount) ?? 0, 1e12),
  };
  if (packet.event === 'like') {
    const count = integer(data.likeCount ?? data.count);
    return count && count <= 1e6 ? { ...base, count, coins: 0 } : null;
  }
  const type = integer(data.giftType ?? data.giftDetails?.giftType);
  const ended = data.repeatEnd ?? data.repeat_end;
  if (type === 1 && ![true, 1, '1'].includes(ended)) return null;
  if (type === null && [false, 0, '0'].includes(ended)) return null;
  const count = integer(data.repeatCount ?? data.repeat_count ?? 1);
  const cost = integer(data.diamondCount ?? data.giftDetails?.diamondCount ?? data.extendedGiftInfo?.diamondCount);
  if (!count || count > 1e6 || cost === null || cost > 1e6) return null;
  const group = id(data.groupId ?? data.group_id);
  if (type === 1 && group) base.event_id = `gift:${viewerId}:${id(data.giftId) || 'gift'}:${group}`;
  return { ...base, count, coins: cost * count };
}
