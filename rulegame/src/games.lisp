(define fox+geese
  (game
    (stones
      (f (color maroon))
      (g (color green))
      (# (color black)))
    (initialBoard
      (# # g g g # #)
      (# # g g g # #)
      (g g g g g g g)
      (_ _ _ f _ _ _)
      (_ _ _ _ _ _ _)
      (# # _ _ _ # #)
      (# # _ _ _ # #))
    (players
      (Geese (color lightgreen))
      (Fox (color chocolate)))
    (rules
      (for dir (N S W E)
           (for (player x) ((Geese g) (Fox f))
                (player
                  (row dir
                       (x _) (_ x))))
           (Fox
             (row dir
                  (f g _) (_ _ f)))))))

(define checkers
  (game
    (stones
      (b (color black))
      (w (color white)))
    (initialBoard
      (b _ b _ b _ b _)
      (_ b _ b _ b _ b)
      (b _ b _ b _ b _)
      (_ _ _ _ _ _ _ _)
      (_ _ _ _ _ _ _ _)
      (_ w _ w _ w _ w)
      (w _ w _ w _ w _)
      (_ w _ w _ w _ w))
    (players
      (Black (color lightblue))
      (White (color lightgreen)))
    (rules
      (for (player x y dirs) ((Black b w (SE SW)) (White w b (NE NW)))
           (for dir dirs
                (player
                  (row dir
                       (x _) (_ x)))
                (player
                  (row dir
                       (x y _) (_ _ x))))))))
