export type Audience = "tutor" | "student" | "parent";

/** Якорь в адресе ↔ аудитория: ссылки с первого экрана и с других сайтов. */
export const AUDIENCE_HASH: Record<Audience, string> = {
  tutor: "repetitoram",
  student: "uchenikam",
  parent: "roditelyam",
};
