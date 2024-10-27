(define fox+geese
  (game
    (title "Fox and Geese")
    (description "Ancient game. The fox captures geese by jumping over them. The geese win if the fox cannot move, the fox wins when there are not enough geese left to trap him.")
    (stones
      (f (circle (color maroon)))
      (g (circle (color green)))
      (# (nothing)))
    (initialBoard
      (# # g g g # #)
      (# # g g g # #)
      (g g g g g g g)
      (_ _ _ f _ _ _)
      (_ _ _ _ _ _ _)
      (# # _ _ _ # #)
      (@ # _ _ _ # #)
      (g # # # # # #))
    (players
      (Geese (robot) (color green))
      (Fox (human) (color maroon)))
    (rules
      (for dir (N S W E)
           (for (player x next) ((Geese g f) (Fox f g))
                (player
                  (and
                    ; move
                    (row dir (x _) (_ x))
                    ; end turn
                    (row S (@ x) (@ next)))))
           (Fox
             (and
               ; move
               (row dir (f g _) (_ _ f))
               ; end turn
               (row S (@ f) (@ g))))))))

(define minicheckers
  (game
    (title "Minicheckers")
    (description "A simplified version of checkers, without queens, mandatory capturing and capture chains. Look at the other checkers instead.")
    (stones
      (b (circle (color gray)))
      (w (circle (color white)))
      (# (nothing)))
    (initialBoard
      (b _ b _ b _ b _)
      (_ b _ b _ b _ b)
      (b _ b _ b _ b _)
      (_ _ _ _ _ _ _ _)
      (_ _ _ _ _ _ _ _)
      (_ w _ w _ w _ w)
      (w _ w _ w _ w _)
      (_ w _ w _ w _ w)
      (# # # # # # # #)
      (P w # # # # # #))
    (players
      (Black (human) (color chocolate))
      (White (human) (color deepskyblue)))
    (rules
      (for (player x y dirs) ((Black b w (SE SW)) (White w b (NE NW)))
           (for dir dirs
                (player
                  (and
                    ; move
                    (row dir
                         (x _) (_ x))
                    ; end turn
                    (row E (P x) (P y))))
                (player
                  (and
                    ; move
                    (row dir
                         (x y _) (_ _ x))
                    ; end turn
                    (row E (P x) (P y)))))))))


; with mandatory captures and multiple hops
; bug: if multiple captures at different locations are possible, both are done in one round
(define checkers
  (game
    (title "Checkers")
    (description "Pieces move forward diagonally, and capture by jumping over other pieces.
                 Capturing is mandatory. A piece can jump multiple times in one turn.
                 Pieces that reach the opposite end of the board are promoted to queens.")
    (stones
      (b (circle (color gray)))
      (B (circle (color darkblue))) ; queen
      (w (circle (color white)))
      (W (circle (color yellow))) ; queen
      (# (nothing))
      (+ (nothing)))
    (initialBoard
      (+ + + + + + + +)
      (b _ b _ b _ b _)
      (_ b _ b _ b _ b)
      (b _ b _ b _ b _)
      (_ _ _ _ _ _ _ _)
      (_ _ _ _ _ _ _ _)
      (_ w _ w _ w _ w)
      (w _ w _ w _ w _)
      (_ w _ w _ w _ w)
      (+ + + + + + + +)
      (# # # # # # # #)
      (P w # # # # # #))
    (players
      (CheckBlack (nature) (color magenta)) ; forces black to capture
      (Black (human) (color chocolate))
      (CheckWhite (nature) (color yellow)) ; forces white to capture
      (White (robot) (color deepskyblue)))
    (rules
      (for (player x X y Y fwd supervisor)
           ((Black b B w W (SE SW) CheckBlack)
            (White w W b B (NE NW) CheckWhite))
           (for (xX dirs) ((x fwd) (X (NE NW SE SW)))
                (for dir dirs
                     (player
                       (and
                         ; move
                         (row dir
                              (xX _) (_ xX))
                         ; end turn
                         (row E (P x) (P y))))
                     (for yY (y Y)
                          (player
                            (and
                              ; capture
                              (row dir
                                   (xX yY _) (_ _ xX))
                              (row E (C x) (C x))))
                          (supervisor
                            (and
                              ; check capture
                              (row dir
                                   (xX yY _) (xX yY _))
                              ; transform to capture turn
                              (row E (P x) (C x)))))))
           (for dir fwd
                (supervisor
                  ;upgrade to queen
                  (row dir (x +) (X +))))
           (supervisor
             ; end previous player's capture turn
             (row E (C y) (P x)))))))

(define blocksworld
  (game
    (title "Blocksworld")
    (description "Stack blocks.")
    (stones
      (b (circle (color green)))
      (# (block (color gray))))
    (initialBoard
      (_ _ _ _ _ b b #)
      (_ _ _ b b b b #)
      (_ _ _ _ _ b b #)
      (_ _ _ _ _ _ b #)
      (_ _ _ _ _ _ _ #)
      (_ _ _ _ _ _ _ #)
      (_ _ _ _ _ _ _ #))
    (players
      (Human (human) (color green)))
    (rules
      (Human
        (and
          (row E (_ b) (_ _))
          (row E (_ #) (b #))))
      (Human
        (and
          (row E (_ b) (_ _))
          (row E (_ b) (b b)))))))

(define glueworld
  (game
    (title "Glue World")
    (description "Place blocks. Use glue to prevent them from falling.")
    (stones
      (b (circle (color green)))
      (g (circle (color yellow)))
      (u (circle (color purple)))
      (v (circle (color pink)))
      (+ (block (color gray)))
      (k (circle (color white)))
      (# (nothing)))
    (initialBoard
      (_ _ _ _ _ b b +)
      (_ _ _ b b b b +)
      (_ _ _ _ _ b b +)
      (_ _ _ _ _ _ b +)
      (_ _ _ + + _ _ +)
      (_ _ _ + C _ _ +)
      (_ _ _ + + _ _ +)
      (# # # # # # # #)
      (P # # G L U E !)
      (H # # k k k k k)
      (# # # k k k k k))
    (players
      (Human (human) (color green))
      (grounder (nature) (color purple))
      (gravity (robot) (color purple))
      (degrounder (nature) (color purple))
      (let-human-play (nature) (color purple)))
    (rules
      (let-human-play
        (row S (P ...) (P H)))
      (for rule
          (((row E (b) (_))
            (row E (_) (b)))
           ((row E (g) (b)))
           ((row E (C _ _) (C b _)))
           (for dir (N S W)
                (for x (g b)
                     ((row E (# k) (# #))
                      (row E (b) (_))
                      (row dir (_ x) (g x))))))
          (Human
            (and
              (for r rule r)
              (row S (P H) (P ...)))))
      ; f = free falling guaranteed
      (gravity
        (row E (b _) (_ b)))
      ; detect connection of blocks to ground
      ; g = glued is connected in all directions
      (for (x y dirs) ((b u (E)) (g v (N E S W)))
           (grounder
             (row E (x +) (y +)))
           (for dir dirs
                (for z (u v)
                     (grounder
                       (row dir (x z) (y z)))))
           (degrounder
             (row E (y) (x))))
      (gravity
        (row E (g) (b))))))

(define wuziqi
  (game
    (title "Wuziqi")
    (description "This is a variant of Gomoku: Players take turns placing stones. When a player gets a line of 5 stones, they can remove it and replace one enemy stone with their own.")
    (stones
      (w (circle (color white)))
      (b (circle (color black)))
      (# (nothing)))
    (initialBoard
      (_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _)
      (_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _)
      (_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _)
      (_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _)
      (_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _)
      (_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _)
      (_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _)
      (_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _)
      (_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _)
      (_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _)
      (_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _)
      (_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _)
      (_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _)
      (_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _)
      (_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _)
      (_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _)
      (_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _)
      (_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _)
      (# # # # # # # # # # # # # # # # # # # # #)
      (P b # # # # # # # # # # # # # # # # # # #))
    (players
      (White (human) (color deepskyblue))
      (Black (human) (color chocolate)))
    (rules
      (for (player x y) ((White w b) (Black b w))
        (player
          (and
            (row N (_) (x))
            (row E (P x) (P y))))
        (for dir (N S E W NE NW SE SW)
          (player
            (and
              (row dir (x x x x x) (_ _ _ _ _))
              (row E (y) (x)))))))))

(define go
  (game
    (title "Go (?)")
    (description "Players take turns placing stones. Pieces that are completely surrounded by the other color are captured.")
    (stones
      (w (circle (color white)))
      (b (circle (color black)))
      (f (circle (color red)))
      (# (nothing)))
    (initialBoard
      (_ _ _ _ _ _ _ _ _ _ _ _ _)
      (_ _ _ _ _ _ _ _ _ _ _ _ _)
      (_ _ _ _ _ _ _ _ _ _ _ _ _)
      (_ _ _ _ _ _ _ _ _ _ _ _ _)
      (_ _ _ _ _ _ _ _ _ _ _ _ _)
      (_ _ _ _ _ _ _ _ _ _ _ _ _)
      (_ _ _ _ _ _ _ _ _ _ _ _ _)
      (_ _ _ _ _ _ _ _ _ _ _ _ _)
      (_ _ _ _ _ _ _ _ _ _ _ _ _)
      (_ _ _ _ _ _ _ _ _ _ _ _ _)
      (_ _ _ _ _ _ _ _ _ _ _ _ _)
      (_ _ _ _ _ _ _ _ _ _ _ _ _)
      (_ _ _ _ _ _ _ _ _ _ _ _ _)
      (# # # # # # # # # # # # #)
      (P b # # # # # # # # # # #))
    (players
      (White (human) (color deepskyblue))
      (Black (human) (color chocolate))
      (PreFlooder (nature) (color purple))
      (Flooder (nature) (color purple))
      (Capturer (robot) (color purple))
      (NextTurn (nature) (color purple)))
    (rules
      (for (player x y) ((White w b) (Black b w))
           (player
             (and
               (row N (_) (x))
               (row E (P x) (C x))))
           (NextTurn
             (row E (C x) (P y)))
           (PreFlooder
              (and
                (row N (y) (f))
                (row E (C x) (C x))))
           (for dir (N S W E)
                ; detect freedom
                (Flooder
                  (and
                    (row dir (_ f) (_ y))
                    (row E (C x) (C x))))
                (Flooder
                  (and
                    (row dir (y f) (y y))
                    (row E (C x) (C x))))
                ; capture pieces without freedom
                (Capturer
                  (and
                    (row N (f) (_)))))))))

