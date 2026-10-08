// Pone (o cambia) la contraseña de la consola desde el terminal, por si se olvida.
// Uso: npm run consola:clave          (la pide sin mostrarla)
//      npm run consola:clave -- texto (la toma del argumento)
import { createInterface } from 'node:readline'
import { setPassword, destroyAllSessions } from '../server/auth.js'

function ask(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    // Se escribe la pregunta y, mientras se teclea, no se muestra nada.
    rl.question(question, (answer) => { process.stdout.write('\n'); rl.close(); resolve(answer) })
    rl._writeToOutput = (s) => { if (s.includes(question)) process.stdout.write(question) }
  })
}

let password = process.argv[2]
if (!password) {
  password = await ask('Nueva contraseña de la consola: ')
  const again = await ask('Repítela: ')
  if (password !== again) {
    console.error('No coinciden. No se ha cambiado nada.')
    process.exit(1)
  }
}
try {
  setPassword(password)
  destroyAllSessions()
  console.log('✦ Contraseña guardada. Las sesiones abiertas se han cerrado.')
} catch (err) {
  console.error(err.message)
  process.exit(1)
}
