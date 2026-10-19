import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      retry: 1,
      // Sin esto, React Query "pausa" las queries cuando cree que el navegador esta
      // offline: un estado que no es ni carga ni error, y que hacia que la app
      // mostrara una pantalla vacia como si todo estuviera bien.
      networkMode: 'always',
    },
    mutations: { networkMode: 'always' },
  },
})

export const sessionKey = ['session'] as const
