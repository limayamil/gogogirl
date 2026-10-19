import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './app/AppShell'
import { AuthGate } from './app/AuthScreen'
import { ThemeProvider } from './app/theme'
import { queryClient } from './lib/queryClient'
import { TodayView } from './views/TodayView'
import { CategoriesView } from './views/CategoriesView'
import { WeekView } from './views/WeekView'
import { NotesView } from './views/NotesView'
import { StatsView } from './views/StatsView'
import './styles/global.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AuthGate />}>
              <Route element={<AppShell />}>
                <Route path="/" element={<TodayView />} />
                <Route path="/categorias" element={<CategoriesView />} />
                <Route path="/semana" element={<WeekView />} />
                <Route path="/notas" element={<NotesView />} />
                <Route path="/estadisticas" element={<StatsView />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
)
