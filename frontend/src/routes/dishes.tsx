import { createFileRoute, redirect } from '@tanstack/react-router'
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getDishesOptions,
  getDishesQueryKey,
  createDishMutation,
  deleteDishMutation,
} from '#/api/@tanstack/react-query.gen'
import { getApiErrorMessage } from '#/lib/api'
import type { DishDto } from '#/api/types.gen'

export const Route = createFileRoute('/dishes')({
  beforeLoad: ({ context }) => {
    if (!context.user) throw redirect({ to: '/login' })
    if (!context.user.householdId) throw redirect({ to: '/household' })
  },
  component: DishesPage,
})

function DishesPage() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', imageUrl: '' })

  const { data: dishes = [], isLoading } = useQuery({
    ...getDishesOptions(),
    select: (data) => data as DishDto[],
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: getDishesQueryKey() })

  const createMut = useMutation({
    ...createDishMutation(),
    onSuccess: () => {
      invalidate()
      setForm({ name: '', description: '', imageUrl: '' })
      setShowForm(false)
    },
  })

  const deleteMut = useMutation({ ...deleteDishMutation(), onSuccess: invalidate })

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault()
    createMut.mutate({ body: { name: form.name, description: form.description || null, imageUrl: form.imageUrl || null } })
  }

  const handleDelete = (id: string) => {
    if (!confirm('¿Eliminar este platillo?')) return
    deleteMut.mutate({ path: { id } })
  }

  const error = createMut.isError
    ? getApiErrorMessage(createMut.error)
    : deleteMut.isError
      ? getApiErrorMessage(deleteMut.error)
      : null

  return (
    <main className="page-wrap px-4 pb-8 pt-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--sea-ink)]">🍲 Platillos</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600"
        >
          {showForm ? 'Cancelar' : '+ Agregar platillo'}
        </button>
      </div>

      {error && (
        <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </p>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="island-shell mb-6 rounded-2xl p-6">
          <h2 className="mb-4 text-base font-semibold text-[var(--sea-ink)]">Nuevo platillo</h2>
          <div className="space-y-3">
            <input
              required
              placeholder="Nombre *"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] px-4 py-2.5 text-sm text-[var(--sea-ink)] outline-none focus:border-orange-400"
            />
            <input
              placeholder="Descripción (opcional)"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] px-4 py-2.5 text-sm text-[var(--sea-ink)] outline-none focus:border-orange-400"
            />
            <input
              placeholder="URL de imagen (opcional)"
              value={form.imageUrl}
              onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
              className="w-full rounded-xl border border-[var(--line)] bg-[var(--chip-bg)] px-4 py-2.5 text-sm text-[var(--sea-ink)] outline-none focus:border-orange-400"
            />
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              disabled={createMut.isPending}
              className="rounded-full bg-orange-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:opacity-60"
            >
              {createMut.isPending ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <p className="text-sm text-[var(--sea-ink-soft)]">Cargando platillos…</p>
      ) : dishes.length === 0 ? (
        <div className="island-shell rounded-2xl p-8 text-center">
          <p className="text-4xl">🍽️</p>
          <p className="mt-2 text-sm text-[var(--sea-ink-soft)]">
            Aún no hay platillos. ¡Agrega el primero!
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {dishes.map((dish) => (
            <li key={dish.id} className="island-shell flex flex-col gap-2 rounded-2xl p-5">
              {dish.imageUrl && (
                <img
                  src={dish.imageUrl}
                  alt={dish.name}
                  className="mb-1 h-32 w-full rounded-xl object-cover"
                />
              )}
              <h3 className="text-base font-semibold text-[var(--sea-ink)]">{dish.name}</h3>
              {dish.description && (
                <p className="text-sm text-[var(--sea-ink-soft)]">{dish.description}</p>
              )}
              <button
                onClick={() => handleDelete(dish.id)}
                className="mt-auto self-start rounded-full border border-red-200 px-3 py-1 text-xs font-medium text-red-500 transition hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20"
              >
                Eliminar
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}