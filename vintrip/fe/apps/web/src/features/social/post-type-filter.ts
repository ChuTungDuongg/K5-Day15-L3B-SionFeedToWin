import type { SocialPostDto } from '@vintrip/api-client/core-api/model/index';

/** Reels chỉ gồm bài dạng video; bài viết (vlog) luôn ở tab Bài viết. */
export function isReelPost(post: Pick<SocialPostDto, 'postType'>): boolean {
  return post.postType === 'video';
}
