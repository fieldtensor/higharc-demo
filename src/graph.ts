import { vec2 } from "./vec2";
import {
  lineSegmentIntersect,
  shuffle,
  rayLineSegmentIntersect,
  generateFaceColor
} from "./util";

export const DEFAULT_VERTEX_COUNT = 100;

export type GraphSerialized = {
  vertices: [number, number][];
  edges: [number, number][];
};

export class GraphEdge
{
  readonly vertex0: GraphVertex;
  readonly vertex1: GraphVertex;

  readonly halfEdgeFromVertex0: GraphHalfEdge;
  readonly halfEdgeFromVertex1: GraphHalfEdge;

  constructor(vertex0: GraphVertex, vertex1: GraphVertex)
  {
    this.vertex0 = vertex0;
    this.vertex1 = vertex1;

    this.halfEdgeFromVertex0 = new GraphHalfEdge(vertex0, this);
    this.halfEdgeFromVertex1 = new GraphHalfEdge(vertex1, this);

    this.halfEdgeFromVertex0.twin = this.halfEdgeFromVertex1;
    this.halfEdgeFromVertex1.twin = this.halfEdgeFromVertex0;
  }

  vertices()
  {
    return [this.vertex0, this.vertex1];
  }

  length()
  {
    const vertex0 = this.vertex0;
    const vertex1 = this.vertex1;

    if( ! vertex0 || ! vertex1 )
      return 0;

    return vertex1.pos.sub(vertex0.pos).length();
  }

  sharesVertexWithEdge(edge: GraphEdge)
  {
    const [existingVertex0, existingVertex1] = this.vertices();
    const [vertex0, vertex1] = edge.vertices();

    return (
      existingVertex0 === vertex0 ||
      existingVertex0 === vertex1 ||
      existingVertex1 === vertex0 ||
      existingVertex1 === vertex1
    );
  }
}

export class GraphHalfEdge
{
  origin: GraphVertex;
  edge: GraphEdge;

  twin: GraphHalfEdge | null = null;
  next: GraphHalfEdge | null = null;
  face: GraphFace | null = null;

  constructor(origin: GraphVertex, edge: GraphEdge)
  {
    this.origin = origin;
    this.edge = edge;
  }
}

export class GraphFace
{
  halfEdges: GraphHalfEdge[];
  color: string;

  constructor(halfEdges: GraphHalfEdge[], color: string)
  {
    this.halfEdges = halfEdges;
    this.color = color;
  }

  pointIsInside(point: vec2)
  {
    const rayDirection = new vec2(1, 0);

    let intersections = 0;

    for(const halfEdge of this.halfEdges)
    {
      const edge = halfEdge.edge;

      const [v0, v1] = edge.vertices();

      const intersection = rayLineSegmentIntersect(
        point,
        rayDirection,
        v0.pos,
        v1.pos
      );

      if( intersection )
        intersections++;
    }

    return intersections % 2 === 1;
  }

  neighboringFaces()
  {
    const neighbors = new Set<GraphFace>();

    for(const halfEdge of this.halfEdges)
    {
      if( ! halfEdge )
        continue;

      const owner = halfEdge.face;

      if( owner !== this )
        continue;

      const neighbor = halfEdge?.twin?.face;

      if( neighbor && neighbor !== this )
        neighbors.add(neighbor);
    }

    return [...neighbors];
  }

  shellLayers()
  {
    const layers = [] as GraphFace[][];
    const visited = new Set<GraphFace>();

    let frontier: GraphFace[] = [this];

    while(frontier.length)
    {
      layers.push([...frontier]);

      for(const face of frontier)
        visited.add(face);

      const nextFrontier = [] as GraphFace[];

      for(const face of frontier)
      {
        const neighbors = face.neighboringFaces();

        for(const neighbor of neighbors)
        {
          if( visited.has(neighbor) )
            continue;

          if( nextFrontier.includes(neighbor) )
            continue;

          nextFrontier.push(neighbor);
        }
      }

      frontier = nextFrontier;
    }

    return layers;
  }
}

export class GraphVertex
{
  pos: vec2;
  edges = [] as GraphEdge[];

  constructor(pos: vec2)
  {
    this.pos = pos;
  }

  removeEdge(edge: GraphEdge)
  {
    if( ! edge )
      return;

    const edgeIndex = this.edges.indexOf(edge);

    if( edgeIndex !== -1 )
      this.edges.splice(edgeIndex, 1);
  }

  edgeAngle(edge: GraphEdge)
  {
    const [v0, v1] = edge.vertices();

    let u = (v0 === this) ? v1 : v0;

    const direction = u.pos.sub(this.pos);

    return Math.atan2(direction.y, direction.x);
  }

  sortEdgesCCW()
  {
    this.edges.sort(
      (ea, eb) => this.edgeAngle(ea) - this.edgeAngle(eb)
    );
  }
}

export class Graph
{
  readonly width = 2;
  readonly height = 2;
  readonly padding = 0.1;

  vertices = [] as GraphVertex[];
  edges = [] as GraphEdge[];
  faces = [] as GraphFace[];
  halfEdges = [] as GraphHalfEdge[];

  static fromSerialized(data: GraphSerialized)
  {
    return new Graph(undefined, data);
  }

  static randomizedWithVertexCount(vertexCount: number)
  {
    return new Graph(vertexCount, undefined);
  }

  private constructor(vertexCount?: number, serialized?: GraphSerialized)
  {
    if( serialized ) {
      this.loadFromSerialized(serialized);
    }
    else if( typeof vertexCount === "number" ) {
      this.generateRandomGraph(vertexCount);
    }

    this.buildFaces();
  }

  private generateRandomGraph(vertexCount: number)
  {
    this.addRandomVertices(vertexCount);

    this.createEdges();

    for(const vertex of this.vertices)
      vertex.sortEdgesCCW();

    while(true)
    {
      if( ! this.removeSmallAngles(Math.PI / 6) )
        break;
    }

    while(true)
    {
      if( ! this.removeSparseVertices() )
        break;
    }
  }

  loadFromSerialized(data: GraphSerialized)
  {
    const vertexInstances = data.vertices.map(
      ([x, y]) =>
      {
        return new GraphVertex(new vec2(x, y));
      }
    );

    this.vertices.push(...vertexInstances);

    this.normalizeVerticesToGraphSpace();

    for(const [index0, index1] of data.edges)
    {
      const vertex0 = this.vertices[index0];
      const vertex1 = this.vertices[index1];

      if( ! vertex0 || ! vertex1 )
        continue;

      const edge = new GraphEdge(vertex0, vertex1);

      this.registerEdge(edge);
    }

    for(const vertex of this.vertices)
      vertex.sortEdgesCCW();
  }

  private normalizeVerticesToGraphSpace()
  {
    if( ! this.vertices.length )
      return;

    const min = new vec2(Infinity, Infinity);
    const max = new vec2(-Infinity, -Infinity);

    for(const vertex of this.vertices)
    {
      const { x, y } = vertex.pos;

      min.x = Math.min(min.x, x);
      max.x = Math.max(max.x, x);
      min.y = Math.min(min.y, y);
      max.y = Math.max(max.y, y);
    }

    const width = max.x - min.x;
    const height = max.y - min.y;

    if( width === 0 && height === 0 )
    {
      for(const vertex of this.vertices)
        vertex.pos = new vec2(0, 0);

      return;
    }

    const center = min.add(max).scale(0.5);

    const availableWidth = Math.max(this.width - 2 * this.padding, 0);
    const availableHeight = Math.max(this.height - 2 * this.padding, 0);

    const scale = new vec2(
      width > 0 ? availableWidth / width : Number.POSITIVE_INFINITY,
      height > 0 ? availableHeight / height : Number.POSITIVE_INFINITY
    );

    const uniformScale = Math.min(scale.x, scale.y);

    if( ! Number.isFinite(uniformScale) || uniformScale <= 0 )
    {
      for(const vertex of this.vertices)
        vertex.pos = new vec2(0, 0);

      return;
    }

    for(const vertex of this.vertices)
      vertex.pos = vertex.pos.sub(center).scale(uniformScale);
  }

  removeSmallAngles(threshold: number)
  {
    let removedEdge = false;

    for(const vertex of this.vertices)
    {
      const edges = [...vertex.edges];

      if( vertex.edges.length < 2 )
        continue;

      for(let i = 0; i < edges.length; i++)
      {
        const edgeA = edges[i];
        const edgeB = edges[(i + 1) % edges.length];

        if( ! vertex.edges.includes(edgeA) || ! vertex.edges.includes(edgeB) )
          continue;

        if( edgeA === edgeB )
          continue;

        const angleA = vertex.edgeAngle(edgeA);
        const angleB = vertex.edgeAngle(edgeB);

        let angleDelta = angleB - angleA;

        if( angleDelta <= 0 )
          angleDelta += 2 * Math.PI;

        if( angleDelta >= threshold )
          continue;

        const edgeToRemove = edgeA.length() >= edgeB.length() ? edgeA : edgeB;

        this.removeEdge(edgeToRemove);

        removedEdge = true;
      }
    }

    return removedEdge;
  }

  removeSparseVertices()
  {
    const verticesToRemove = [] as GraphVertex[];

    for(const vertex of this.vertices)
    {
      const incidentEdges = vertex.edges;

      if( incidentEdges.length === 0 )
      {
        verticesToRemove.push(vertex);
        continue;
      }

      if( incidentEdges.length === 1 )
      {
        this.removeEdge(incidentEdges[0]);
        verticesToRemove.push(vertex);
      }
    }

    if( ! verticesToRemove.length )
      return false;

    for(const vertex of verticesToRemove)
    {
      for(const edge of [...vertex.edges])
        this.removeEdge(edge);

      const vertexIndex = this.vertices.indexOf(vertex);

      if( vertexIndex !== -1 )
        this.vertices.splice(vertexIndex, 1);
    }

    return true;
  }

  private buildFaces()
  {
    this.linkHalfEdgesAroundVertices();

    const faces = [] as GraphFace[];

    for(const halfEdge of this.halfEdges)
    {
      if( halfEdge.face )
        continue;

      const halfEdgesInFace = [] as GraphHalfEdge[];
      const traversalSet = new Set<GraphHalfEdge>();

      let current = halfEdge as GraphHalfEdge | null;
      let isClosed = false;

      while(current)
      {
        if( traversalSet.has(current) )
        {
          isClosed = (current === halfEdge);
          break;
        }

        if( current.face )
        {
          isClosed = false;
          break;
        }

        traversalSet.add(current);
        halfEdgesInFace.push(current);

        current = current.next;

        if( current === halfEdge )
        {
          isClosed = true;
          break;
        }
      }

      if( ! isClosed )
        continue;

      const area = this.computeFaceArea(halfEdgesInFace);

      if( area <= 0 )
        continue;

      const face = new GraphFace(
        halfEdgesInFace,
        generateFaceColor()
      );

      for(const faceHalfEdge of halfEdgesInFace)
        faceHalfEdge.face = face;

      faces.push(face);
    }

    this.faces = faces;
  }

  private linkHalfEdgesAroundVertices()
  {
    for(const vertex of this.vertices)
    {
      const outgoing = [] as GraphHalfEdge[];

      for(const edge of vertex.edges)
      {
        const halfEdge =
          (edge.vertex0 === vertex)
          ? edge.halfEdgeFromVertex0
          : edge.halfEdgeFromVertex1;

        outgoing.push(halfEdge);
      }

      const degree = outgoing.length;

      if( degree < 2 )
        continue;

      for(let i = 0; i < degree; i++)
      {
        const current = outgoing[i];
        const prev = outgoing[(i - 1 + degree) % degree];

        const twin = current.twin;

        if( ! twin )
          continue;

        twin.next = prev;
      }
    }
  }

  private computeFaceArea(halfEdges: GraphHalfEdge[])
  {
    let area = 0;

    for(const halfEdge of halfEdges)
    {
      const origin = halfEdge?.origin?.pos;
      const nextOrigin = halfEdge?.next?.origin?.pos;

      if( ! origin || ! nextOrigin )
        return 0;

      area += origin.cross(nextOrigin);
    }

    return area / 2;
  }

  private addRandomVertices(vertexCount: number)
  {
    for(let i = 0; i < vertexCount; i++)
    {
      const pos = new vec2(
        -1 + this.padding + (this.width  - 2 * this.padding) * Math.random(),
        -1 + this.padding + (this.height - 2 * this.padding) * Math.random()
      );

      this.vertices.push(
        new GraphVertex(pos)
      );
    }
  }

  private createEdges()
  {
    const vertexPairs = [] as [GraphVertex, GraphVertex][];
    const totalVertices = this.vertices.length;

    for(let i = 0; i < totalVertices; i++)
    {
      const vertex0 = this.vertices[i];

      for(let j = i + 1; j < totalVertices; j++)
        vertexPairs.push([vertex0, this.vertices[j]]);
    }

    shuffle(vertexPairs);

    for(const [vertex0, vertex1] of vertexPairs)
    {
      if( ! vertex0 || ! vertex1 )
        continue;

      const candidateEdge = new GraphEdge(vertex0, vertex1);

      let intersectsExisting = false;

      for(const existingEdge of this.edges)
      {
        const [existingVertex0, existingVertex1] = existingEdge.vertices();

        if( existingEdge.sharesVertexWithEdge(candidateEdge) )
          continue;

        const intersects = lineSegmentIntersect(
          vertex0.pos,
          vertex1.pos,
          existingVertex0.pos,
          existingVertex1.pos
        );

        if( intersects )
        {
          intersectsExisting = true;
          break;
        }
      }

      if( intersectsExisting )
        continue;

      this.registerEdge(candidateEdge);
    }
  }

  private registerEdge(edge: GraphEdge)
  {
    this.edges.push(edge);

    this.halfEdges.push(
      edge.halfEdgeFromVertex0,
      edge.halfEdgeFromVertex1
    );

    if( edge.vertex0 )
      edge.vertex0.edges.push(edge);

    if( edge.vertex1 )
      edge.vertex1.edges.push(edge);
  }

  removeEdge(edge: GraphEdge)
  {
    if( ! edge )
      return;

    const edgeIndex = this.edges.indexOf(edge);

    if( edgeIndex !== -1 )
      this.edges.splice(edgeIndex, 1);

    this.removeHalfEdge(edge.halfEdgeFromVertex0);
    this.removeHalfEdge(edge.halfEdgeFromVertex1);

    const vertex0 = edge.vertex0;
    const vertex1 = edge.vertex1;

    if( vertex0 )
      vertex0.removeEdge(edge);

    if( vertex1 )
      vertex1.removeEdge(edge);
  }

  private removeHalfEdge(halfEdge: GraphHalfEdge)
  {
    if( ! halfEdge )
      return;

    const index = this.halfEdges.indexOf(halfEdge);

    if( index !== -1 )
      this.halfEdges.splice(index, 1);
  }

  serialize(): GraphSerialized
  {
    const vertices = this.vertices.map(vertex =>
    {
      return [vertex.pos.x, vertex.pos.y] as [number, number];
    });

    const vertexIndices = new Map<GraphVertex, number>();

    this.vertices.forEach((vertex, index) =>
    {
      vertexIndices.set(vertex, index);
    });

    const edges = [] as [number, number][];

    for(const edge of this.edges)
    {
      const vertex0 = edge.vertex0;
      const vertex1 = edge.vertex1;

      if( ! vertex0 || ! vertex1 )
        continue;

      const index0 = vertexIndices.get(vertex0);
      const index1 = vertexIndices.get(vertex1);

      if( index0 === undefined || index1 === undefined )
        continue;

      edges.push([index0, index1]);
    }

    return { vertices, edges };
  }
}

export class GraphRenderer
{
  graph: Graph;
  hoveredFace: GraphFace | null = null;

  constructor(graph: Graph)
  {
    this.graph = graph;
  }

  setGraph(graph: Graph)
  {
    this.graph = graph;
    this.hoveredFace = null;
  }

  render(
    ctx: CanvasRenderingContext2D,
    canvasWidth: number,
    canvasHeight: number)
  {
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    ctx.save();

    this.drawFaces(ctx, canvasWidth, canvasHeight);
    this.drawEdges(ctx, canvasWidth, canvasHeight);
    ctx.restore();
  }

  setHoveredFaceFromScreenPoint(
    screenX: number,
    screenY: number,
    width: number,
    height: number)
  {
    if( width <= 0 || height <= 0 )
      return false;

    const point = this.unproject(screenX, screenY, width, height);
    const faces = this.graph.faces;

    let hovered: GraphFace | null = null;

    for(const face of faces)
    {
      if( face.pointIsInside(point) )
      {
        hovered = face;
        break;
      }
    }

    if( hovered === this.hoveredFace )
      return false;

    this.hoveredFace = hovered;
    return true;
  }

  clearHoveredFace()
  {
    if( ! this.hoveredFace )
      return false;

    this.hoveredFace = null;
    return true;
  }

  private drawFaces(ctx: CanvasRenderingContext2D, width: number, height: number)
  {
    const faces = this.graph.faces;

    if( ! faces.length )
      return;

    const hoverStyles = this.hoveredFace ? this.computeHoverStyles() : null;

    for(const face of faces)
    {
      const style = hoverStyles?.get(face) ?? null;
      this.fillFace(ctx, width, height, face, style);
    }
  }

  private fillFace(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    face: GraphFace,
    style: { color: string; alpha: number } | null)
  {
    const halfEdges = face.halfEdges;

    if( halfEdges.length < 3 )
      return;

    const start = halfEdges[0];

    if( ! start )
      return;

    let current: GraphHalfEdge | null = start;
    let steps = 0;
    const maxSteps = halfEdges.length + 1;

    ctx.beginPath();

    while(current && steps <= maxSteps)
    {
      const origin = current.origin;

      if( ! origin )
        return;

      const point = this.project(origin.pos, width, height);

      if( steps === 0 )
        ctx.moveTo(point.x, point.y);
      else
        ctx.lineTo(point.x, point.y);

      const nextHalfEdge: GraphHalfEdge | null = current.next;

      current = nextHalfEdge;
      steps++;

      if( current === start )
        break;
    }

    if( steps < 3 )
      return;

    ctx.closePath();

    const fillColor = style?.color ?? face.color;
    const fillAlpha = style?.alpha ?? 0.4;

    ctx.fillStyle = fillColor;
    ctx.globalAlpha = fillAlpha;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  private drawEdges(ctx: CanvasRenderingContext2D, width: number, height: number)
  {
    const { edges } = this.graph;

    if( ! edges.length )
      return;

    this.strokeEdgeSet(ctx, width, height, edges, "#94a3b8", 0.9);
  }

  private project(position: vec2, width: number, height: number)
  {
    const { width: graphWidth, height: graphHeight } = this.graph;

    const normalizeAxis = (value: number, span: number) =>
    {
      const halfSpan = span / 2;
      const normalized = (value + halfSpan) / span;
      return Math.max(0, Math.min(1, normalized));
    };

    const normalizedX = normalizeAxis(position.x, graphWidth);
    const normalizedY = normalizeAxis(position.y, graphHeight);

    return {
      x: normalizedX * width,
      y: (1 - normalizedY) * height
    };
  }

  private unproject(x: number, y: number, width: number, height: number)
  {
    const { width: graphWidth, height: graphHeight } = this.graph;
    const normalizedX = x / width;
    const normalizedY = 1 - y / height;
    const graphX = normalizedX * graphWidth - graphWidth / 2;
    const graphY = normalizedY * graphHeight - graphHeight / 2;

    return new vec2(graphX, graphY);
  }

  private computeHoverStyles()
  {
    const hoveredFace = this.hoveredFace;

    if( ! hoveredFace )
      return null;

    const layers = hoveredFace.shellLayers();

    if( ! layers.length )
      return null;

    const styles = new Map<GraphFace, { color: string; alpha: number }>();
    const totalLayers = layers.length;

    for(let layerIndex = 0; layerIndex < totalLayers; layerIndex++)
    {
      const layerFaces = layers[layerIndex];

      if( ! layerFaces?.length )
        continue;

      const color = this.hoverLayerColor(totalLayers, layerIndex);
      const alpha = this.hoverLayerAlpha(totalLayers, layerIndex);

      for(const face of layerFaces)
        styles.set(face, { color, alpha });
    }

    return styles;
  }

  private hoverLayerColor(totalLayers: number, layerIndex: number)
  {
    if( totalLayers <= 1 )
      return "hsl(122, 75%, 80%)";

    const ratio = layerIndex / (totalLayers - 1);
    const hue = 122;
    const saturation = 70 + ratio * 25;
    const lightness = 80 - ratio * 55;

    return `hsl(${hue}, ${saturation.toFixed(1)}%, ${lightness.toFixed(1)}%)`;
  }

  private hoverLayerAlpha(totalLayers: number, layerIndex: number)
  {
    if( totalLayers <= 1 )
      return 0.9;

    const ratio = layerIndex / (totalLayers - 1);
    return 0.9 - ratio * 0.5;
  }

  private strokeEdgeSet(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    edges: GraphEdge[],
    color: string,
    alpha: number)
  {
    if( ! edges.length )
      return;

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.25;
    ctx.globalAlpha = alpha;

    ctx.beginPath();

    for(const edge of edges)
    {
      const [vertex0, vertex1] = edge.vertices();

      if( ! vertex0 || ! vertex1 )
        continue;

      const start = this.project(vertex0.pos, width, height);
      const end = this.project(vertex1.pos, width, height);

      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
    }

    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}
