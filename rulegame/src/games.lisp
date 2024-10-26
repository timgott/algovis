(define fox+geese
  (game
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
      (Geese (human) (color green))
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
      (Black (human) (color tan))
      (White (human) (color lightblue)))
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
(define checkers
  (game
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
    (stones
      (b (circle (color chocolate)))
      (# (block (color gray))))
    (initialBoard
      (_ _ _ _ _ b b #)
      (_ _ _ _ _ _ b #)
      (_ _ _ _ _ _ _ #)
      (_ _ _ _ _ _ _ #)
      (_ _ _ _ _ _ _ #)
      (_ _ _ _ _ _ _ #)
      (_ _ _ _ _ _ _ #))
    (players
      (Human (human) (color blue)))
    (rules
      (Human
        (and
          (row E (_ b) (_ _))
          (row E (_ #) (b #))))
      (Human
        (and
          (row E (_ b) (_ _))
          (row E (_ b) (b b)))))))


