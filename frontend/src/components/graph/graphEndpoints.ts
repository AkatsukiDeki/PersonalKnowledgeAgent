import { GraphLink, GraphNode } from '../../types/graph';

export function endpointId(end: GraphLink['source'] | GraphLink['target']): string {
  return typeof end === 'object' && end !== null ? end.id : end;
}

export function endpointLabel(
  end: GraphLink['source'] | GraphLink['target'],
  fallback = 'Unknown',
): string {
  if (typeof end === 'object' && end !== null && typeof end.label === 'string') {
    return end.label;
  }
  return fallback;
}

export function isPositionedNode(node: GraphNode): boolean {
  return typeof node.x === 'number' && typeof node.y === 'number';
}

export function resolveGraphNode(nodes: GraphNode[], nodeId: string): GraphNode | undefined {
  return nodes.find(
    (n) =>
      n.id === nodeId ||
      n.chunk_id === nodeId ||
      n.source_id === nodeId ||
      n.memory_id === nodeId,
  );
}
