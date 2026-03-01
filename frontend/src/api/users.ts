import { api } from './client'
import type { User, Role, Permission } from '../types'

export const listUsers = async () => (await api.get('/users')).data as User[]
export const createUser = async (body: Record<string, unknown>) => (await api.post('/users', body)).data as User
export const updateUser = async (id: string, body: Record<string, unknown>) => (await api.put(`/users/${id}`, body)).data as User
export const deleteUser = async (id: string) => api.delete(`/users/${id}`)
export const getUserRoles = async (id: string) => (await api.get(`/users/${id}/roles`)).data as Role[]
export const assignRole = async (userId: string, roleId: string) => api.post(`/users/${userId}/roles/${roleId}`)
export const removeRole = async (userId: string, roleId: string) => api.delete(`/users/${userId}/roles/${roleId}`)
export const listRoles = async () => (await api.get('/users/roles/all')).data as Role[]
export const createRole = async (body: { name: string; description?: string }) => (await api.post('/users/roles', body)).data as Role
export const deleteRole = async (id: string) => api.delete(`/users/roles/${id}`)
export const getRolePermissions = async (roleId: string) => (await api.get(`/users/roles/${roleId}/permissions`)).data as Permission[]
export const setRolePermissions = async (roleId: string, perms: Permission[]) => api.put(`/users/roles/${roleId}/permissions`, perms)
