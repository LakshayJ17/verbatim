-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Create Tables

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_url TEXT,
  external_id TEXT,
  creator_name TEXT,
  duration_seconds INTEGER,
  thumbnail_url TEXT,
  categories TEXT[] DEFAULT '{}',
  content_safety TEXT DEFAULT 'SAFE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT max_categories CHECK (array_length(categories, 1) IS NULL OR array_length(categories, 1) <= 3)
);

CREATE TABLE transcripts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  language TEXT,
  normalized_segments JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE analyses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  summary TEXT,
  topics JSONB,
  important_moments JSONB,
  caption_suggestions JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE quotes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  analysis_id UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  speaker TEXT,
  start_seconds NUMERIC,
  end_seconds NUMERIC,
  why_it_matters TEXT,
  confidence NUMERIC,
  verification_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE insights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  analysis_id UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  explanation TEXT NOT NULL,
  category TEXT,
  importance_score INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE designs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  quote_id UUID REFERENCES quotes(id) ON DELETE CASCADE,
  insight_id UUID REFERENCES insights(id) ON DELETE CASCADE,
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  rendered_image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_design_reference CHECK (
    (quote_id IS NOT NULL AND insight_id IS NULL) OR
    (insight_id IS NOT NULL AND quote_id IS NULL)
  )
);

CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  design_id UUID NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
  caption TEXT,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private', 'unlisted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE likes (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, post_id)
);

CREATE TABLE bookmarks (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, post_id)
);

CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE follows (
  follower_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id),
  CONSTRAINT no_self_follow CHECK (follower_id != following_id)
);

CREATE TABLE collections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE collection_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('quote', 'insight', 'post')),
  quote_id UUID REFERENCES quotes(id) ON DELETE CASCADE,
  insight_id UUID REFERENCES insights(id) ON DELETE CASCADE,
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_collection_item CHECK (
    (item_type = 'quote' AND quote_id IS NOT NULL AND insight_id IS NULL AND post_id IS NULL) OR
    (item_type = 'insight' AND insight_id IS NOT NULL AND quote_id IS NULL AND post_id IS NULL) OR
    (item_type = 'post' AND post_id IS NOT NULL AND quote_id IS NULL AND insight_id IS NULL)
  )
);

-- 3. Indexes
CREATE INDEX idx_sources_user_id ON sources(user_id);
CREATE INDEX idx_transcripts_source_id ON transcripts(source_id);
CREATE INDEX idx_analyses_source_id ON analyses(source_id);
CREATE INDEX idx_quotes_analysis_id ON quotes(analysis_id);
CREATE INDEX idx_insights_analysis_id ON insights(analysis_id);
CREATE INDEX idx_designs_user_id ON designs(user_id);
CREATE INDEX idx_posts_user_id ON posts(user_id);
CREATE INDEX idx_posts_visibility ON posts(visibility);
CREATE INDEX idx_comments_post_id ON comments(post_id);
CREATE INDEX idx_collection_items_collection_id ON collection_items(collection_id);

-- Fix 6: Reverse Indexes
CREATE INDEX idx_likes_post_id ON likes(post_id);
CREATE INDEX idx_bookmarks_post_id ON bookmarks(post_id);
CREATE INDEX idx_follows_following_id ON follows(following_id);

-- Fix 1: Partial Unique Indexes for collection_items
CREATE UNIQUE INDEX idx_collection_items_uniq_quote ON collection_items(collection_id, quote_id) WHERE quote_id IS NOT NULL;
CREATE UNIQUE INDEX idx_collection_items_uniq_insight ON collection_items(collection_id, insight_id) WHERE insight_id IS NOT NULL;
CREATE UNIQUE INDEX idx_collection_items_uniq_post ON collection_items(collection_id, post_id) WHERE post_id IS NOT NULL;


-- 4. Enable Row Level Security (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE designs ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_items ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies

-- Profiles
CREATE POLICY "Public profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id AND coalesce((auth.jwt() ->> 'is_anonymous'), 'false') = 'false');
CREATE POLICY "Users can delete own profile" ON profiles FOR DELETE USING (auth.uid() = id AND coalesce((auth.jwt() ->> 'is_anonymous'), 'false') = 'false');

-- Sources
CREATE POLICY "Owner access" ON sources FOR ALL USING (auth.uid() = user_id AND coalesce((auth.jwt() ->> 'is_anonymous'), 'false') = 'false');

-- Transcripts (Fix 2: Normalized Ownership)
CREATE POLICY "Owner access" ON transcripts FOR ALL USING (
  coalesce((auth.jwt() ->> 'is_anonymous'), 'false') = 'false' AND
  EXISTS (SELECT 1 FROM sources WHERE sources.id = transcripts.source_id AND sources.user_id = auth.uid())
);

-- Analyses (Fix 2: Normalized Ownership)
CREATE POLICY "Owner access" ON analyses FOR ALL USING (
  coalesce((auth.jwt() ->> 'is_anonymous'), 'false') = 'false' AND
  EXISTS (SELECT 1 FROM sources WHERE sources.id = analyses.source_id AND sources.user_id = auth.uid())
);

-- Quotes (Fix 2 & Fix 8)
CREATE POLICY "Owner access" ON quotes FOR ALL USING (
  coalesce((auth.jwt() ->> 'is_anonymous'), 'false') = 'false' AND
  EXISTS (
    SELECT 1 FROM analyses
    JOIN sources ON sources.id = analyses.source_id
    WHERE analyses.id = quotes.analysis_id AND sources.user_id = auth.uid()
  )
);
CREATE POLICY "Public read" ON quotes FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM designs 
    JOIN posts ON posts.design_id = designs.id 
    WHERE designs.quote_id = quotes.id AND posts.visibility = 'public'
  )
);

-- Insights (Fix 2 & Fix 8)
CREATE POLICY "Owner access" ON insights FOR ALL USING (
  coalesce((auth.jwt() ->> 'is_anonymous'), 'false') = 'false' AND
  EXISTS (
    SELECT 1 FROM analyses
    JOIN sources ON sources.id = analyses.source_id
    WHERE analyses.id = insights.analysis_id AND sources.user_id = auth.uid()
  )
);
CREATE POLICY "Public read" ON insights FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM designs 
    JOIN posts ON posts.design_id = designs.id 
    WHERE designs.insight_id = insights.id AND posts.visibility = 'public'
  )
);

-- Designs (Fix 3 & Fix 8: WITH CHECK for ownership verification)
CREATE POLICY "Owner access" ON designs FOR ALL USING (auth.uid() = user_id AND coalesce((auth.jwt() ->> 'is_anonymous'), 'false') = 'false') WITH CHECK (
  auth.uid() = user_id AND coalesce((auth.jwt() ->> 'is_anonymous'), 'false') = 'false' AND
  (
    (quote_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM quotes
      JOIN analyses ON analyses.id = quotes.analysis_id
      JOIN sources ON sources.id = analyses.source_id
      WHERE quotes.id = quote_id AND sources.user_id = auth.uid()
    ))
    OR
    (insight_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM insights
      JOIN analyses ON analyses.id = insights.analysis_id
      JOIN sources ON sources.id = analyses.source_id
      WHERE insights.id = insight_id AND sources.user_id = auth.uid()
    ))
  )
);
CREATE POLICY "Public read" ON designs FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM posts WHERE posts.design_id = designs.id AND posts.visibility = 'public'
  )
);

-- Posts (Fix 4 & Fix 8: WITH CHECK for design ownership)
CREATE POLICY "Owner access" ON posts FOR ALL USING (auth.uid() = user_id AND coalesce((auth.jwt() ->> 'is_anonymous'), 'false') = 'false') WITH CHECK (
  auth.uid() = user_id AND coalesce((auth.jwt() ->> 'is_anonymous'), 'false') = 'false' AND
  EXISTS (SELECT 1 FROM designs WHERE designs.id = design_id AND designs.user_id = auth.uid())
);
CREATE POLICY "Public read" ON posts FOR SELECT USING (visibility = 'public');

-- Likes
CREATE POLICY "Owner access" ON likes FOR ALL USING (auth.uid() = user_id AND coalesce((auth.jwt() ->> 'is_anonymous'), 'false') = 'false') WITH CHECK (
  auth.uid() = user_id AND coalesce((auth.jwt() ->> 'is_anonymous'), 'false') = 'false' AND
  EXISTS (SELECT 1 FROM posts WHERE posts.id = post_id AND (posts.visibility = 'public' OR posts.user_id = auth.uid()))
);
CREATE POLICY "Public read" ON likes FOR SELECT USING (
  EXISTS (SELECT 1 FROM posts WHERE posts.id = likes.post_id AND posts.visibility = 'public')
);

-- Bookmarks
CREATE POLICY "Owner access" ON bookmarks FOR ALL USING (auth.uid() = user_id AND coalesce((auth.jwt() ->> 'is_anonymous'), 'false') = 'false') WITH CHECK (
  auth.uid() = user_id AND coalesce((auth.jwt() ->> 'is_anonymous'), 'false') = 'false' AND
  EXISTS (SELECT 1 FROM posts WHERE posts.id = post_id AND (posts.visibility = 'public' OR posts.user_id = auth.uid()))
);

-- Comments (Fix 5)
CREATE POLICY "Owner access" ON comments FOR ALL USING (auth.uid() = user_id AND coalesce((auth.jwt() ->> 'is_anonymous'), 'false') = 'false') WITH CHECK (
  auth.uid() = user_id AND coalesce((auth.jwt() ->> 'is_anonymous'), 'false') = 'false' AND
  EXISTS (SELECT 1 FROM posts WHERE posts.id = post_id AND (posts.visibility = 'public' OR posts.user_id = auth.uid()))
);
CREATE POLICY "Public read" ON comments FOR SELECT USING (
  EXISTS (SELECT 1 FROM posts WHERE posts.id = comments.post_id AND posts.visibility = 'public')
);

-- Follows
CREATE POLICY "Owner access" ON follows FOR ALL USING (auth.uid() = follower_id AND coalesce((auth.jwt() ->> 'is_anonymous'), 'false') = 'false');
CREATE POLICY "Public read" ON follows FOR SELECT USING (true);

CREATE POLICY "Owner access" ON collections FOR ALL USING (auth.uid() = user_id AND coalesce((auth.jwt() ->> 'is_anonymous'), 'false') = 'false');
CREATE POLICY "Owner access" ON collection_items FOR ALL USING (
  EXISTS (SELECT 1 FROM collections WHERE collections.id = collection_items.collection_id AND collections.user_id = auth.uid() AND coalesce((auth.jwt() ->> 'is_anonymous'), 'false') = 'false')
) WITH CHECK (
  EXISTS (SELECT 1 FROM collections WHERE collections.id = collection_items.collection_id AND collections.user_id = auth.uid() AND coalesce((auth.jwt() ->> 'is_anonymous'), 'false') = 'false')
);
