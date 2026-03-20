import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import http from 'node:http'
import { resolve } from 'node:path'
import process from 'node:process'

import { Command } from 'commander'

function openBrowser(url: string): void {
  if (process.platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref()
  } else if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref()
  } else {
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref()
  }
}

function waitForServer(port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  return new Promise((res) => {
    function attempt() {
      const req = http.get(`http://127.0.0.1:${port}/health`, (response) => {
        res(response.statusCode === 200)
      })
      req.on('error', () => {
        if (Date.now() < deadline) {
          setTimeout(attempt, 250)
        } else {
          res(false)
        }
      })
      req.end()
    }
    attempt()
  })
}

function spawnServer(workspaceDir: string, port: number): ChildProcess {
  return spawn(
    'lac-lsp',
    ['--http-only', '--workspace', workspaceDir, '--port', String(port)],
    { stdio: ['ignore', 'inherit', 'inherit'] },
  )
}

export const serveCommand = new Command('serve')
  .description('Start the life-as-code HTTP server and open the dashboard in your browser')
  .argument('[dir]', 'Workspace root to index (default: current directory)')
  .option('-p, --port <n>', 'HTTP port (default: 7474)', '7474')
  .option('--no-open', 'Skip opening the browser automatically')
  .action(async (dir: string | undefined, options: { port: string; open: boolean }) => {
    const workspaceDir = resolve(dir ?? process.cwd())
    const port = parseInt(options.port, 10)
    const url = `http://127.0.0.1:${port}`

    process.stdout.write(
      `Starting lac-lsp HTTP server for workspace "${workspaceDir}" on port ${port}...\n`,
    )

    // Mutable child ref — health monitor updates this on restart
    let child = spawnServer(workspaceDir, port)
    let shuttingDown = false

    child.on('error', (err) => {
      process.stderr.write(`Error: could not start lac-lsp — ${err.message}\n`)
      process.stderr.write(
        `Make sure lac-lsp is installed: npm i -g @life-as-code/lac-lsp\n`,
      )
      process.exit(1)
    })

    child.on('exit', (code) => {
      if (!shuttingDown) {
        // Will be handled by health monitor; only exit if already shutting down
        process.stderr.write(`lac-lsp exited with code ${code ?? 0}\n`)
      }
    })

    // Wait up to 6 seconds for the server to respond
    const ready = await waitForServer(port, 6000)

    if (ready) {
      process.stdout.write(`\nReady — ${url}\n\n`)
      process.stdout.write(`  GET ${url}/features     all indexed features\n`)
      process.stdout.write(`  GET ${url}/lint         run lint against all features\n`)
      process.stdout.write(`  GET ${url}/events       SSE stream of changes\n\n`)
      process.stdout.write(`Press Ctrl+C to stop.\n`)

      if (options.open) {
        openBrowser(url)
      }
    } else {
      process.stderr.write(
        `Warning: server on port ${port} did not respond within 6 s — it may still be starting up.\n`,
      )
    }

    // Health-monitor: every 15 s check if the server is still alive
    let failCount = 0
    const healthInterval = setInterval(async () => {
      if (shuttingDown) {
        clearInterval(healthInterval)
        return
      }

      const alive = await waitForServer(port, 2000)
      if (alive) {
        failCount = 0
        return
      }

      failCount++
      if (failCount >= 3) {
        process.stderr.write(
          `\nWarning: lac-lsp appears to have crashed. Restarting...\n`,
        )

        try {
          child.kill()
        } catch {
          // ignore — already dead
        }

        child = spawnServer(workspaceDir, port)
        failCount = 0

        child.on('error', (err) => {
          process.stderr.write(`Error restarting lac-lsp — ${err.message}\n`)
        })

        // Wait for restart and re-open browser if needed
        const restarted = await waitForServer(port, 6000)
        if (restarted) {
          process.stdout.write(`lac-lsp restarted successfully.\n`)
          if (options.open) {
            openBrowser(url)
          }
        } else {
          process.stderr.write(`Warning: lac-lsp did not come back up after restart.\n`)
        }
      }
    }, 15_000)

    // Keep the process alive and clean up on SIGINT
    process.on('SIGINT', () => {
      shuttingDown = true
      clearInterval(healthInterval)
      process.stdout.write('\nShutting down...\n')
      child.kill('SIGTERM')
      process.exit(0)
    })
  })
