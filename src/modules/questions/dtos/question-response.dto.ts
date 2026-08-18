export interface QuestionOptionDto {
  id: string;
  ord: number;
  text: string;
  isCorrect: boolean;
}

export interface QuestionDto {
  id: string;
  stem: string;
  explanationMd: string | null;
  sourceRef: string | null;
  moduleCode: string;
  quizCode: string;
  options: QuestionOptionDto[];
}
