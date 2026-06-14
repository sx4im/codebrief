declare module "tree-sitter" {
  class Parser {
    setLanguage(language: unknown): void;
    parse(input: string): Parser.Tree;
  }

  namespace Parser {
    interface Tree {
      rootNode: SyntaxNode;
    }

    interface SyntaxNode {
      type: string;
      text: string;
      namedChildren: SyntaxNode[];
      hasError: boolean;
    }
  }

  export = Parser;
}

declare module "tree-sitter-typescript" {
  const languages: {
    typescript: unknown;
    tsx: unknown;
  };

  export default languages;
}
