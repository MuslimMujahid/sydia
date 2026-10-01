/** Keep mutable profile names out of the account owner's stored fact subject. */
export function canonicalMemorySubject(
  text: string,
  profile: { name: string; preferredAddress: string | null },
): string {
  const aliases = [profile.preferredAddress, profile.name]
    .filter((alias): alias is string => Boolean(alias?.trim()))
    .map((alias) => alias.trim())
    .sort((left, right) => right.length - left.length);

  for (const alias of aliases) {
    if (!text.toLocaleLowerCase().startsWith(alias.toLocaleLowerCase()))
      continue;
    const rest = text.slice(alias.length);
    if (!rest || /^\s|^['’]s\b|^[:,]/u.test(rest)) return `The user${rest}`;
  }

  return text;
}
