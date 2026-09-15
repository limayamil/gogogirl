/**
 * Las variables del bucket, sin arrastrar el SDK.
 *
 * Vive separado de storage.ts porque `GET /api/state` solo necesita el booleano, y
 * como la funcion de Netlify importa los catorce handlers de forma estatica, tenerlo
 * en el mismo modulo que los imports de @aws-sdk hacia que toda request a /api/*
 * pagara el parse de once megas de SDK en el arranque en frio.
 */

export const endpoint = process.env.S3_ENDPOINT
export const bucket = process.env.S3_BUCKET
export const accessKeyId = process.env.S3_ACCESS_KEY_ID
export const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY
export const region = process.env.S3_REGION || 'auto'

export const storageConfigured = Boolean(endpoint && bucket && accessKeyId && secretAccessKey)
