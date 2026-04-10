import { useCallback, useEffect, useState } from 'react';
import { X, Plus, Trash2, Shield, User as UserIcon, Pencil, Key } from 'lucide-react';
import type { User } from '../../types';
import { api } from '../../lib/api';

interface Props {
  onClose: () => void;
}

export function UserManagement({ onClose }: Props) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [passwordId, setPasswordId] = useState<number | null>(null);
  const [error, setError] = useState('');

  // Create form state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState('user');
  const [formError, setFormError] = useState('');

  // Edit form state
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editRole, setEditRole] = useState('');

  // Password form state
  const [newPassword, setNewPassword] = useState('');

  const loadUsers = useCallback(async () => {
    try {
      const data = await api.getUsers();
      setUsers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    try {
      await api.createUser({ username, password, displayName, role });
      setUsername('');
      setPassword('');
      setDisplayName('');
      setRole('user');
      setShowForm(false);
      loadUsers();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create user');
    }
  };

  const handleEdit = (user: User) => {
    setEditingId(user.id);
    setEditDisplayName(user.displayName);
    setEditRole(user.role);
    setPasswordId(null);
  };

  const handleSaveEdit = async (id: number) => {
    setFormError('');
    try {
      await api.updateUser(id, { displayName: editDisplayName, role: editRole });
      setEditingId(null);
      loadUsers();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to update user');
    }
  };

  const handleChangePassword = async (id: number) => {
    if (!newPassword) return;
    setFormError('');
    try {
      await api.updateUser(id, { password: newPassword });
      setNewPassword('');
      setPasswordId(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to change password');
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete user "${name}"? This cannot be undone.`)) return;
    try {
      await api.deleteUser(id);
      loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-100">User Management</h2>
          <button onClick={onClose} className="rounded p-1 text-slate-500 hover:text-slate-300">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[28rem] overflow-y-auto p-5">
          {error && (
            <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>
          )}

          {loading ? (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-cyan-400" />
            </div>
          ) : (
            <div className="space-y-2">
              {users.map((u) => (
                <div key={u.id}>
                  <div className="flex items-center justify-between rounded-lg border border-slate-800 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-700 text-xs font-medium text-slate-200">
                        {u.displayName.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)}
                      </div>
                      <div>
                        <p className="text-sm text-slate-200">{u.displayName}</p>
                        <p className="text-[11px] text-slate-500">@{u.username}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="flex items-center gap-1 text-[11px] text-slate-500">
                        {u.role === 'admin' ? (
                          <Shield className="h-3 w-3 text-cyan-400" />
                        ) : (
                          <UserIcon className="h-3 w-3" />
                        )}
                        {u.role}
                      </span>
                      <button
                        onClick={() => handleEdit(u)}
                        className="rounded p-1 text-slate-600 hover:text-cyan-400"
                        title="Edit user"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => { setPasswordId(u.id); setEditingId(null); setNewPassword(''); }}
                        className="rounded p-1 text-slate-600 hover:text-amber-400"
                        title="Change password"
                      >
                        <Key className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(u.id, u.displayName)}
                        className="rounded p-1 text-slate-600 hover:text-red-400"
                        title="Delete user"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Inline edit form */}
                  {editingId === u.id && (
                    <div className="mt-1 rounded-lg border border-slate-800 bg-slate-800/50 p-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1 block text-[11px] text-slate-500">Display Name</label>
                          <input
                            value={editDisplayName}
                            onChange={(e) => setEditDisplayName(e.target.value)}
                            className="w-full rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-cyan-600"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] text-slate-500">Role</label>
                          <select
                            value={editRole}
                            onChange={(e) => setEditRole(e.target.value)}
                            className="w-full rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-cyan-600"
                          >
                            <option value="user">User</option>
                            <option value="admin">Admin</option>
                          </select>
                        </div>
                      </div>
                      {formError && <p className="mt-2 text-xs text-red-400">{formError}</p>}
                      <div className="mt-3 flex justify-end gap-2">
                        <button
                          onClick={() => setEditingId(null)}
                          className="rounded-md px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleSaveEdit(u.id)}
                          className="rounded-md bg-cyan-600 px-3 py-1.5 text-xs text-white hover:bg-cyan-500"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Inline password change */}
                  {passwordId === u.id && (
                    <div className="mt-1 rounded-lg border border-slate-800 bg-slate-800/50 p-3">
                      <label className="mb-1 block text-[11px] text-slate-500">New Password for @{u.username}</label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Enter new password"
                        className="w-full rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-cyan-600"
                      />
                      {formError && <p className="mt-2 text-xs text-red-400">{formError}</p>}
                      <div className="mt-3 flex justify-end gap-2">
                        <button
                          onClick={() => setPasswordId(null)}
                          className="rounded-md px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleChangePassword(u.id)}
                          disabled={!newPassword}
                          className="rounded-md bg-amber-600 px-3 py-1.5 text-xs text-white hover:bg-amber-500 disabled:opacity-50"
                        >
                          Change Password
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add user form */}
          {showForm ? (
            <form onSubmit={handleCreate} className="mt-4 space-y-3 rounded-lg border border-slate-800 p-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] text-slate-500">Username</label>
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-cyan-600"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-slate-500">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-cyan-600"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[11px] text-slate-500">Display Name</label>
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-cyan-600"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] text-slate-500">Role</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 outline-none focus:border-cyan-600"
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>

              {formError && (
                <p className="text-xs text-red-400">{formError}</p>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="rounded-md px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-cyan-600 px-3 py-1.5 text-xs text-white hover:bg-cyan-500"
                >
                  Create User
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-700 py-2.5 text-xs text-slate-500 hover:border-cyan-600 hover:text-cyan-400"
            >
              <Plus className="h-3.5 w-3.5" />
              Add User
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
