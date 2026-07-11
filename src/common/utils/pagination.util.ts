import { Model, QueryFilter } from 'mongoose';

export interface PaginatedResult<T> {
  items: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

/**
 * Shared skip/limit + count logic for any Mongoose model. Every list
 * endpoint that needs pagination calls this instead of re-deriving
 * `skip = (page - 1) * limit` and a separate `countDocuments` call each
 * time — one correct implementation instead of N slightly-different ones.
 */
export async function paginate<T>(
  model: Model<T>,
  filter: QueryFilter<T>,
  page: number,
  limit: number,
): Promise<PaginatedResult<T>> {
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    model.find(filter).skip(skip).limit(limit).exec(),
    model.countDocuments(filter).exec(),
  ]);

  return {
    items,
    meta: { total, page, limit, totalPages: Math.ceil(total / limit) || 1 },
  };
}

/** Builds a case-insensitive regex filter across the given fields, for the `search` query param. */
export function buildSearchFilter<T>(
  search: string | undefined,
  fields: (keyof T)[],
): QueryFilter<T> {
  if (!search) return {};
  const regex = new RegExp(escapeRegex(search), 'i');
  return { $or: fields.map((field) => ({ [field]: regex })) };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
