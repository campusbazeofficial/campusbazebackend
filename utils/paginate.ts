import type {
    FilterQuery,
    Model,
    Document,
    SortOrder,
    PopulateOptions,
} from 'mongoose'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constant.js'

export interface PaginationOptions {
    page?: number
    limit?: number
    sort?: string
    order?: 'asc' | 'desc'
}

export interface PaginatedResult<T> {
    data: T[]
    meta: {
        total: number
        page: number
        limit: number
        totalPages: number
        hasNextPage: boolean
        hasPrevPage: boolean
    }
}

export type PopulateParam = string | PopulateOptions

export const paginate = async <T extends Document>(
    model: Model<T>,
    filter: FilterQuery<T> = {},
    options: PaginationOptions = {},
    select?: string,
    populate?: PopulateParam | PopulateParam[],
): Promise<PaginatedResult<T>> => {
    const page = Math.max(1, options.page || 1)
    const limit = Math.min(
        MAX_PAGE_SIZE,
        Math.max(1, options.limit || DEFAULT_PAGE_SIZE),
    )
    const skip = (page - 1) * limit

    const sortField = options.sort || 'createdAt'
    const sortOrder: SortOrder = options.order === 'asc' ? 1 : -1

    const query = model
        .find(filter)
        .sort({ [sortField]: sortOrder })
        .skip(skip)
        .limit(limit)
    if (select) {
        query.select(select)
    }

    if (populate) {
        const pops: PopulateParam[] = Array.isArray(populate)
            ? populate
            : [populate]
        pops.forEach((p) => query.populate(p as PopulateOptions))
    }

    const [data, total] = await Promise.all([
        query.lean<T[]>(),
        model.countDocuments(filter),
    ])

    const totalPages = Math.ceil(total / limit)

    return {
        data,
        meta: {
            total,
            page,
            limit,
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
        },
    }
}

export type QueryValue = string | string[] | number | boolean | undefined

export const parsePaginationQuery = (
    query: Record<string, QueryValue>,
): PaginationOptions => {
    const num = (v: QueryValue): number | undefined => {
        if (typeof v === 'number') return v
        if (typeof v === 'string') return parseInt(v, 10) || undefined
        if (Array.isArray(v)) return parseInt(v[0], 10) || undefined
        return undefined
    }

    const str = (v: QueryValue): string | undefined => {
        if (typeof v === 'string') return v
        if (Array.isArray(v)) return v[0]
        if (typeof v === 'number') return String(v)
        return undefined
    }

    return {
        page: num(query.page) ?? 1,
        limit: num(query.limit) ?? DEFAULT_PAGE_SIZE,
        sort: str(query.sort),
        order: (str(query.order) as 'asc' | 'desc') || 'desc',
    }
}
