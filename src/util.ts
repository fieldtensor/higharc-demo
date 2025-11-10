import { vec2 } from "./vec2";
import type { GraphSerialized } from "./graph";

export function rayLineSegmentIntersect(
  rayOrigin: vec2,
  rayDirection: vec2,
  v0: vec2,
  v1: vec2)
{
  const segment = v1.sub(v0);
  const denominator = rayDirection.cross(segment);

  const originToSegment = v0.sub(rayOrigin);
  const tRay = originToSegment.cross(segment) / denominator;
  const tSegment = originToSegment.cross(rayDirection) / denominator;

  if(
    ! Number.isFinite(tRay) ||
    ! Number.isFinite(tSegment) ||
    tRay < 0 ||
    tSegment < 0 ||
    tSegment > 1)
  {
    return undefined;
  }

  return new vec2(
    rayOrigin.x + rayDirection.x * tRay,
    rayOrigin.y + rayDirection.y * tRay
  );
}
  
export function lineSegmentIntersect(
  a0: vec2,
  a1: vec2,
  b0: vec2,
  b1: vec2)
{
  const r = a1.sub(a0);
  const s = b1.sub(b0);

  const denominator = r.cross(s);

  const q = b0.sub(a0);

  const ta = q.cross(s) / denominator;
  const tb = q.cross(r) / denominator;

  return (
    Number.isFinite(ta) &&
    Number.isFinite(tb) &&
    ! (ta < 0 || ta > 1 || tb < 0 || tb > 1)
  );
}

export function shuffle<T>(array: T[])
{
  for(let i = array.length - 1; i > 0; i--)
  {
    const j = Math.floor(Math.random() * (i + 1));

    const tmp = array[i];
    array[i] = array[j];
    array[j] = tmp;
  }

  return array;
}

export function generateFaceColor()
{
  const hue = Math.floor(Math.random() * 360);
  const saturation = 75 + Math.random() * 20;
  const lightness = 48 + Math.random() * 12;
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

export function parseGraphData(data: unknown): GraphSerialized
{
  if( ! data || typeof data !== "object" )
    throw new Error("JSON must be an object");

  const record = data as Record<string, unknown>;
  const verticesRaw = record.vertices;
  const edgesRaw = record.edges;

  if( ! Array.isArray(verticesRaw) || ! Array.isArray(edgesRaw) )
    throw new Error("JSON must include vertices and edges arrays");

  const vertices = verticesRaw.map((item, index) =>
  {
    if( ! Array.isArray(item) || item.length !== 2 )
      throw new Error(`Vertex at index ${index} must be [x, y]`);

    const [x, y] = item;

    if( typeof x !== "number" || typeof y !== "number" )
      throw new Error(`Vertex at index ${index} must contain numbers`);

    return [x, y] as [number, number];
  });

  const edges = edgesRaw.map((item, index) =>
  {
    if( ! Array.isArray(item) || item.length !== 2 )
      throw new Error(`Edge at index ${index} must be [i, j]`);

    const [i, j] = item;

    if( typeof i !== "number" || typeof j !== "number" )
      throw new Error(`Edge at index ${index} must contain numbers`);

    return [i, j] as [number, number];
  });

  return { vertices, edges };
}
