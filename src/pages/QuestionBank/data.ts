export type Industry =
  | "DSA"
  | "Full Stack"
  | "Data Science"
  | "DevOps"
  | "System Design"
  | "Mobile"
  | "Cloud";
export const INDUSTRIES: Industry[] = [
  "DSA",
  "Full Stack",
  "Data Science",
  "DevOps",
  "System Design",
  "Mobile",
  "Cloud",
];

export type Language =
  | "JavaScript"
  | "TypeScript"
  | "Python"
  | "Java"
  | "C++"
  | "C"
  | "C#"
  | "Go"
  | "General";
export const LANGUAGES: Language[] = [
  "JavaScript",
  "TypeScript",
  "Python",
  "Java",
  "C++",
  "C",
  "C#",
  "Go",
  "General",
];

export type Question = {
  id: string;
  title: string;
  difficulty: "Easy" | "Medium" | "Hard";
  industry: Industry;
  language: Language;
  category: string;
  answer: string;
};

export type Company = {
  id: string;
  name: string;
  logoUrl?: string; // Optional URL for the logo
  questionCount: number;
  description: string;
  questions: Question[];
};

export const MOCK_COMPANIES: Company[] = [
  {
    id: "google",
    name: "Google",
    questionCount: 45,
    description:
      "Questions frequently asked in Google interviews, focusing on DSA and System Design.",
    questions: [
      {
        id: "g1",
        title: "Two Sum",
        difficulty: "Easy",
        industry: "DSA",
        language: "C++",
        category: "Arrays",
        answer:
          "Use a Hash Map to store the difference between the target and the current element. As you iterate through the array, if the current element exists in the map, you have found the pair. Space complexity is O(N) and Time complexity is O(N).",
      },
      {
        id: "g2",
        title: "LRU Cache",
        difficulty: "Medium",
        industry: "System Design",
        language: "Java",
        category: "Design",
        answer:
          "Use a Hash Map paired with a Doubly Linked List. The hash map provides O(1) access to nodes, and the doubly linked list allows O(1) addition and removal of nodes to keep track of the most and least recently used items.",
      },
      {
        id: "g3",
        title: "Word Ladder",
        difficulty: "Hard",
        industry: "DSA",
        language: "Python",
        category: "Graphs",
        answer:
          "Use Breadth-First Search (BFS). Represent words as nodes and add edges if words differ by a single character. Start BFS from the beginword, finding the shortest path to the endword.",
      },
    ],
  },
  {
    id: "microsoft",
    name: "Microsoft",
    questionCount: 32,
    description:
      "Common Microsoft interview questions, emphasizing problem-solving and string manipulation.",
    questions: [
      {
        id: "m1",
        title: "Reverse a Linked List",
        difficulty: "Easy",
        industry: "DSA",
        language: "C",
        category: "Linked List",
        answer:
          "Maintain three pointers: prev, current, and next. Iterate through the list, storing the next node, pointing current.next to prev, moving prev to current, and current to next. Finally, the new head is prev.",
      },
      {
        id: "m2",
        title: "Merge Intervals",
        difficulty: "Medium",
        industry: "DSA",
        language: "TypeScript",
        category: "Arrays",
        answer:
          "Sort the intervals based on the start time. Iterate through the intervals, constantly updating the end time of the last merged interval if the current interval overlaps with it.",
      },
    ],
  },
  {
    id: "amazon",
    name: "Amazon",
    questionCount: 68,
    description:
      "Amazon specific questions mainly focused on Leadership Principles and practical coding algorithms.",
    questions: [
      {
        id: "a1",
        title: "Number of Islands",
        difficulty: "Medium",
        industry: "DSA",
        language: "Go",
        category: "Graphs",
        answer:
          "Iterate over the 2D grid. Whenever you find a '1' (land), increment the island count and use DFS or BFS to mark or change all connected '1's to '0's (water) to avoid double counting.",
      },
      {
        id: "a2",
        title: "Building a Recommendation System",
        difficulty: "Hard",
        industry: "Data Science",
        language: "Python",
        category: "Machine Learning",
        answer:
          "Use Collaborative Filtering or Content-Based Filtering. For collaborative filtering, you can use matrix factorization techniques like SVD or neural networks to predict user-item ratings based on historical data.",
      },
    ],
  },
  {
    id: "meta",
    name: "Meta",
    questionCount: 29,
    description:
      "Meta questions, heavily reliant on graph theory and fast-paced algorithmic puzzles.",
    questions: [
      {
        id: "f1",
        title: "Valid Palindrome II",
        difficulty: "Easy",
        industry: "DSA",
        language: "JavaScript",
        category: "Strings",
        answer:
          "Use two pointers from both ends of the string moving inwards. If you encounter a mismatch, you can either skip the left character or the right character. Check if either resulting substring is a genuine palindrome.",
      },
      {
        id: "f2",
        title: "Implementing a Chat Architecture",
        difficulty: "Hard",
        industry: "System Design",
        language: "General",
        category: "Networking",
        answer:
          "Use WebSockets for real-time bidirectional communication. Implement a message broker like Redis or RabbitMQ for scalability, and store chat history in a database like Cassandra or MongoDB for fast writes and reads.",
      },
    ],
  },
];

export type UserQuestion = Question & {
  createdAt: string;
};

export const USER_QUESTIONS: UserQuestion[] = [
  {
    id: "u1",
    title: "How to reverse a binary tree?",
    difficulty: "Easy",
    industry: "DSA",
    language: "JavaScript",
    category: "Trees",
    answer:
      "You can reverse a binary tree (also known as inverting it) by recursively swapping the left and right children of every node. If the tree is empty, return null. Otherwise, recursively invert the left subtree, recursively invert the right subtree, and then swap them.",
    createdAt: "2023-10-25",
  },
  {
    id: "u2",
    title: "Explain Event Loop in JavaScript",
    difficulty: "Medium",
    industry: "Full Stack",
    language: "JavaScript",
    category: "JavaScript",
    answer:
      "The event loop is a mechanism that allows JavaScript to perform non-blocking I/O operations despite being single-threaded. It constantly checks the call stack to see if it's empty, and if so, pushes the first task from the task queue onto the call stack to execute it.",
    createdAt: "2023-11-02",
  },
  {
    id: "u3",
    title: "Implement a rate limiter",
    difficulty: "Hard",
    industry: "System Design",
    language: "Go",
    category: "System Design",
    answer:
      "A rate limiter can be implemented using various algorithms like Token Bucket, Leaking Bucket, Fixed Window Counter, or Sliding Window Log. The Token Bucket is commonly used, where tokens are added to a bucket at a fixed rate, and each request consumes a token. If the bucket is empty, requests are dropped.",
    createdAt: "2023-11-15",
  },
  {
    id: "u4",
    title: "Longest Palindromic Substring",
    difficulty: "Medium",
    industry: "DSA",
    language: "C++",
    category: "Strings",
    answer: `Based on the screenshot, you are working on the **Longest Palindromic Substring** problem on LeetCode. This is a classic interview question that tests your understanding of string manipulation and efficient algorithm design.

## Strategy: Expand Around Center
While this problem can be solved using Dynamic Programming (**O(n^2)** space), the **Expand Around Center** approach is more space-efficient (**O(1)** extra space) and more intuitive for an interview setting.

### Logic
- **A palindrome mirrors around its center**: A string of length **n** has **2n - 1** potential centers (either a single character for odd-length palindromes or the space between two characters for even-length palindromes).
- **Action**: Iterate through each center and expand outward as long as the characters match.
- **Optimization**: Keep track of the maximum length and the starting position found so far.

### C++ Implementation
\`\`\`cpp
class Solution {
public:
    string longestPalindrome(string s) {
        if (s.length() < 1) return "";
        int start = 0, end = 0;
        
        for (int i = 0; i < s.length(); i++) {
            // Case 1: Palindrome center is a single character (e.g., "aba")
            int len1 = expandAroundCenter(s, i, i);
            // Case 2: Palindrome center is between two characters (e.g., "abba")
            int len2 = expandAroundCenter(s, i, i + 1);
            
            int maxLen = max(len1, len2);
            if (maxLen > end - start) {
                // Update the boundaries of the longest palindrome found
                start = i - (maxLen - 1) / 2;
                end = i + maxLen / 2;
            }
        }
        return s.substr(start, end - start + 1);
    }

private:
    int expandAroundCenter(const string& s, int left, int right) {
        while (left >= 0 && right < s.length() && s[left] == s[right]) {
            left--;
            right++;
        }
        // Returns the length of the palindrome found
        return right - left - 1;
    }
};
\`\`\`

## Key Talking Points for the Interviewer
- **Time Complexity**: **O(n^2)**, where **n** is the length of the string. Since we expand from each center, and there are **2n-1** centers, the worst case is **O(n^2)**.
- **Space Complexity**: **O(1)**, as we are only storing the start and end indices of the best result. This is better than the **O(n^2)** space required for the Dynamic Programming approach.
- **Corner Cases handled**: Empty strings, single-character strings, and strings with all identical characters.
- **Advanced mention**: If asked about a more optimal solution, you can mention **Manacher's Algorithm**, which solves this in **O(n)** time.`,
    createdAt: "2024-04-07",
  },
];
