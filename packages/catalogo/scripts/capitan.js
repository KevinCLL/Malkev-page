// Crea la cuenta del capitán o le cambia la contraseña.
// Uso: npm run capitan -- [usuario]   (pregunta la contraseña sin mostrarla)
//      ADMIN_PASSWORD=… npm run capitan
import { createInterface } from 'node:readline'
import { pool } from '../server/db.js'
import { upsertCaptain } from '../server/auth.js'
import { migrate } from './migrate.js'

const username = process.argv[2] || process.env.ADMIN_USER || 'capitan'

function ask(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    rl._writeToOutput = (s) => rl.output.write(s.startsWith(question) ? s : '')
    rl.question(question, (answer) => { rl.close(); process.stdout.write('\n'); resolve(answer) })
  })
}

try {
  await migrate({ log: () => {} })
  const password = process.env.ADMIN_PASSWORD || (await ask(`Contraseña para «${username}» (mínimo 10 caracteres): `))
  const user = await upsertCaptain(username, password)
  console.log(`Listo: ya puedes entrar en /admin como «${user.username}».`)
} catch (err) {
  console.error(err.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
