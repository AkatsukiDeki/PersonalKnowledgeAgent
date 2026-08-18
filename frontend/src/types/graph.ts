import { NodeObject, LinkObject } from 'react-force-graph-2d';

export interface GraphNode extends NodeObject {
  id: string;
  label: string;
  group: string;
  category?: string;
  is_active?: boolean;
  confidence?: number;
  created_at?: string;
  source_id?: string;
  chunk_id?: string;
  superseded_by?: string;
  aliases?: string[];
  content?: string;
  val?: number;
  rationale?: string;
  alternatives?: string[];
  memory_id?: string;
}

export interface GraphLink extends LinkObject {
  id?: string;
  source: string | GraphNode;
  target: string | GraphNode;
  type: string;
  confidence?: number;
  evidence_summary?: string;
  color?: string;
}

export interface GraphTopologyResponse {
  nodes: GraphNode[];
  links: GraphLink[];
}
