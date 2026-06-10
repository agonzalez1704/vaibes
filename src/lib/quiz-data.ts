import {
  Airplane01Icon, Dumbbell01Icon, PaintBrush01Icon, MusicNote01Icon, Rocket01Icon,
  Leaf01Icon, Restaurant01Icon, BookOpen01Icon, Yoga01Icon, Briefcase01Icon,
  Shirt01Icon, GameController01Icon, FootballIcon, Camera01Icon, WorkoutGymnasticsIcon,
  Atom01Icon, ChefHatIcon, FlowerIcon, FlashIcon, Target01Icon, Happy01Icon,
  Brain02Icon, Fire02Icon, MountainIcon, Sun03Icon, QuillWrite01Icon, ArrowRight02Icon,
  FavouriteIcon, Minimize01Icon,
} from '@hugeicons/core-free-icons';

export type Bubble = { key: string; label: string; icon: any };
export type QuizPage = {
  id: string;
  title: string;
  hint: string;
  multi: true;
  items: Bubble[];
};

export const QUIZ_PAGES: QuizPage[] = [
  {
    id: 'interests',
    title: 'What lights you up?',
    hint: 'Tap what you like. Tap again to love it more.',
    multi: true,
    items: [
      { key: 'travel', label: 'Travel', icon: Airplane01Icon },
      { key: 'fitness', label: 'Fitness', icon: Dumbbell01Icon },
      { key: 'art', label: 'Art', icon: PaintBrush01Icon },
      { key: 'music', label: 'Music', icon: MusicNote01Icon },
      { key: 'tech', label: 'Tech', icon: Rocket01Icon },
      { key: 'nature', label: 'Nature', icon: Leaf01Icon },
      { key: 'food', label: 'Food', icon: Restaurant01Icon },
      { key: 'reading', label: 'Reading', icon: BookOpen01Icon },
      { key: 'spirituality', label: 'Spirit', icon: Yoga01Icon },
      { key: 'business', label: 'Business', icon: Briefcase01Icon },
      { key: 'fashion', label: 'Fashion', icon: Shirt01Icon },
      { key: 'gaming', label: 'Gaming', icon: GameController01Icon },
      { key: 'sports', label: 'Sports', icon: FootballIcon },
      { key: 'photography', label: 'Photo', icon: Camera01Icon },
      { key: 'dance', label: 'Dance', icon: WorkoutGymnasticsIcon },
      { key: 'science', label: 'Science', icon: Atom01Icon },
      { key: 'cooking', label: 'Cooking', icon: ChefHatIcon },
      { key: 'mindfulness', label: 'Calm', icon: FlowerIcon },
    ],
  },
  {
    id: 'mood',
    title: 'What’s your everyday vibe?',
    hint: 'Pick the moods that feel like you.',
    multi: true,
    items: [
      { key: 'calm', label: 'Calm', icon: FlowerIcon },
      { key: 'energetic', label: 'Energetic', icon: FlashIcon },
      { key: 'focused', label: 'Focused', icon: Target01Icon },
      { key: 'playful', label: 'Playful', icon: Happy01Icon },
      { key: 'reflective', label: 'Reflective', icon: Brain02Icon },
      { key: 'bold', label: 'Bold', icon: Fire02Icon },
      { key: 'stoic', label: 'Stoic', icon: MountainIcon },
      { key: 'hopeful', label: 'Hopeful', icon: Sun03Icon },
    ],
  },
  {
    id: 'tone',
    title: 'How should we speak to you?',
    hint: 'Choose the voice of your daily phrases.',
    multi: true,
    items: [
      { key: 'poetic', label: 'Poetic', icon: QuillWrite01Icon },
      { key: 'direct', label: 'Direct', icon: ArrowRight02Icon },
      { key: 'warm', label: 'Warm', icon: FavouriteIcon },
      { key: 'minimal', label: 'Minimal', icon: Minimize01Icon },
    ],
  },
];
