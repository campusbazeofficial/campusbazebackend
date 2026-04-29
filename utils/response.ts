import type { Response } from "express";
import type { PaginatedResult } from "./paginate.js";

export const sendSuccess = (
  res: Response,
  data: object = {},
  statusCode = 200
): void => {
  res.status(statusCode).json({ success: true, data });
};

export const sendCreated = (
  res: Response,
  data: object = {}
): void => {
  sendSuccess(res, data, 201);
};

export const sendPaginated = <T>(
  res: Response,
  result: PaginatedResult<T>,
  statusCode = 200
): void => {
  res.status(statusCode).json({
    success: true,
    data: result.data,
    meta: result.meta,
  });
};

export const sendError = (
  res: Response,
  message: string,
  statusCode = 500
): void => {
  res.status(statusCode).json({
    success: false,
    data: { message },
  });
};
