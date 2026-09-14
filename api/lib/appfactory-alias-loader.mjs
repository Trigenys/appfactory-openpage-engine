const ROOT_URL = new URL('../../', import.meta.url)

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const relativePath = specifier.slice(2)
    const target = new URL(`src/${relativePath}.js`, ROOT_URL)
    return nextResolve(target.href, context)
  }

  return nextResolve(specifier, context)
}
