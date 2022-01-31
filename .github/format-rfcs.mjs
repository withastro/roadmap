import * as fs from 'node:fs/promises'

const dir = new URL('../proposals/', import.meta.url)

const bases = []

for await (const dirent of await fs.opendir(dir)) {
	if (dirent.name.endsWith('.md')) bases.push(dirent.name)
}

bases.sort((a, b) => a.localeCompare(b))

for (const [index, base] of Object.entries(bases)) {
	let next = base

	next = next.toLocaleLowerCase()
	next = next.replace(/^\d\d\d\d-/, '')
	next = next.slice(0, -3)
	next = next.replace(/[^a-z0-1-]+/g, '-')
	next = String(Number(index) + 1).padStart(4, 0) + '-' + next
	next = next + '.md'

	if (next !== base) {
		await fs.rename(
			new URL(base, dir),
			new URL(next, dir)
		)
	}
}
