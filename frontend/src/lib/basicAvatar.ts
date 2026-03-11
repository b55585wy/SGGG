export type BasicAvatarGender = 'male' | 'female'
export type BasicAvatarColor = 'blue' | 'red' | 'yellow'
export type BasicAvatarShirt = 'short' | 'long'
export type BasicAvatarUnderdress = 'short' | 'long'
export type BasicAvatarGlasses = 'no' | 'yes'
export type BasicAvatarEmotion = 0 | 1 | 2 | 3

export type BasicAvatarCombo = {
  gender: BasicAvatarGender
  color: BasicAvatarColor
  shirt: BasicAvatarShirt
  underdress: BasicAvatarUnderdress
  glasses: BasicAvatarGlasses
}

export function buildBasicAvatarImageSrc(combo: BasicAvatarCombo) {
  return `/basic/${combo.gender}_${combo.color}_${combo.shirt}_${combo.underdress}_${combo.glasses}.png`
}

export function buildEmotionAvatarImageSrc(combo: BasicAvatarCombo, emotion: BasicAvatarEmotion) {
  return `/emotion/emotion_${emotion}/${combo.gender}_${combo.color}_${combo.shirt}_${combo.underdress}_${combo.glasses}_${emotion}.png`
}

export function mapFoodScoreToEmotion(score: number): BasicAvatarEmotion {
  if (score <= 3) return 0
  if (score <= 6) return 1
  if (score <= 8) return 2
  return 3
}

export const basicAvatarDefaults: BasicAvatarCombo = {
  gender: 'male',
  color: 'blue',
  shirt: 'short',
  underdress: 'short',
  glasses: 'no',
}

export const basicAvatarOptions = {
  gender: [
    { value: 'male' as const, label: '男', icon: '/icon/gender/boy.png' },
    { value: 'female' as const, label: '女', icon: '/icon/gender/girl.png' },
  ],
  color: [
    { value: 'blue' as const, label: '蓝', icon: '/icon/color/blue.png' },
    { value: 'red' as const, label: '红', icon: '/icon/color/red.png' },
    { value: 'yellow' as const, label: '黄', icon: '/icon/color/yellow.png' },
  ],
  shirt: [
    { value: 'short' as const, label: '短', icon: '/icon/shirt/short.png' },
    { value: 'long' as const, label: '长', icon: '/icon/shirt/long.png' },
  ],
  underdress: [
    { value: 'short' as const, label: '短', icon: '/icon/underdress/short.png' },
    { value: 'long' as const, label: '长', icon: '/icon/underdress/long.png' },
  ],
  glasses: [
    { value: 'no' as const, label: '无', icon: '/icon/glasses/没眼镜.png' },
    { value: 'yes' as const, label: '有', icon: '/icon/glasses/有眼镜.png' },
  ],
}
