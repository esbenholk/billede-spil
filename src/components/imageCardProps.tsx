export type ImageCardProps = {
  url: string;
  title: string;
  tags: string[];
  id: string;
  aiCaption: string;
  description: string;
  aiTitle: string;
  aiVibe: string;
  aiObjects: string;
  community: string;
  parentIds: string;
  ai_so_me_type: string;
  aiFeeling: string;
  aiStyle: string;
  aiTrend: string;
  aiPeople: string[];
  descriptor?: ImageDescriptor;
};

export type ImageDescriptor = {
  title?: string;
  caption?: string;
  altText?: string;
  description?: string;
  so_me_type?: string;
  trend?: string;
  feeling?: string;

  subject?: string;
  setting?: string;
  medium?: string;
  realism?: string;
  lighting?: string;
  palette?: string;
  composition?: string;

  style?: string;

  tags?: string[];
  vibe?: string[];
  objects?: string[];
  scenes?: string[];
  people?: string[];

  must_keep?: string[];
};
