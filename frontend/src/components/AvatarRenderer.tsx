import { useMemo } from 'react'
import { createAvatar } from '@dicebear/core'
import * as adventurer from '@dicebear/adventurer'
import {
  EXPRESSIONS,
  type AvatarBase,
  type ExpressionKey,
} from '@/lib/avatarConfig'

type Props = {
  base: AvatarBase
  expression?: ExpressionKey
  className?: string
}

export default function AvatarRenderer({ base, expression = 'neutral', className = '' }: Props) {
  const svgDataUri = useMemo(() => {
    const expr = EXPRESSIONS[expression]
    const avatar = createAvatar(adventurer, {
      seed: `${base.skinColor}-${base.hair}-${base.hairColor}`,
      skinColor: [base.skinColor],
      hair: [base.hair] as never[],
      hairColor: [base.hairColor],
      eyes: [expr.eyes] as never[],
      eyebrows: [expr.eyebrows] as never[],
      mouth: [expr.mouth] as never[],
      glassesProbability: 0,
      earringsProbability: 0,
      featuresProbability: 0,
    })
    return avatar.toDataUri()
  }, [base.skinColor, base.hair, base.hairColor, expression])

  return (
    <img
      src={svgDataUri}
      alt="avatar"
      className={className}
    />
  )
}
